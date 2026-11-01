import { Cattle } from "../models/cattle.model.js";
import { Offer, OFFER_STATUS, OFFER_TTL_DAYS, MIN_OFFER_RATIO } from "../models/offer.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, readFlash, reject, respond, safeRedirect } from "../utils/http.js";
import { notify } from "../services/notification.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const LIST_LIMIT = 50;

const rupees = (value) => `₹ ${Number(value).toLocaleString("en-IN")}`;

const expireOldOffers = async (filter) => {
    await Offer.updateMany(
        { ...filter, status: OFFER_STATUS.PENDING, expiresAt: { $lt: new Date() } },
        { $set: { status: OFFER_STATUS.EXPIRED, decidedAt: new Date() } }
    );
};

export const createOffer = asyncHandler(async (req, res) => {
    const cattleId = String(req.body?.cattleId || "");
    const back = `/cattle/${cattleId}`;

    if (!isObjectId(cattleId)) throw new ApiError(400, "Invalid cattle id");

    const cattle = await Cattle.findById(cattleId)
        .select("name breedName farmer price isActive sold isDeleted")
        .lean();

    if (!cattle || cattle.isDeleted || cattle.isActive === false || cattle.sold) {
        return reject(req, res, { status: 404, message: "This cattle is not available", redirectTo: "/products?type=cattle" });
    }

    if (String(cattle.farmer) === String(req.user._id)) {
        return reject(req, res, { status: 400, message: "You cannot make an offer on your own cattle", redirectTo: back });
    }

    if (typeof cattle.price !== "number" || cattle.price <= 0) {
        return reject(req, res, { status: 400, message: "This cattle has no price. Message the seller instead.", redirectTo: back });
    }

    const amount = Math.round(Number(req.body?.amount));

    if (!Number.isFinite(amount) || amount <= 0) {
        return reject(req, res, { status: 400, message: "Enter a valid offer amount", redirectTo: back });
    }

    if (amount > cattle.price) {
        return reject(req, res, {
            status: 400,
            message: `Your offer is above the listed price of ${rupees(cattle.price)}. Message the seller to buy at that price.`,
            redirectTo: back
        });
    }

    if (amount < Math.ceil(cattle.price * MIN_OFFER_RATIO)) {
        return reject(req, res, {
            status: 400,
            message: `Offers must be at least ${Math.round(MIN_OFFER_RATIO * 100)}% of the listed price (${rupees(Math.ceil(cattle.price * MIN_OFFER_RATIO))}).`,
            redirectTo: back
        });
    }

    await expireOldOffers({ cattle: cattle._id, buyer: req.user._id });

    const open = await Offer.exists({
        cattle: cattle._id,
        buyer: req.user._id,
        status: OFFER_STATUS.PENDING
    });

    if (open) {
        return reject(req, res, {
            status: 409,
            message: "You already have an offer waiting on this cattle. Withdraw it to send a new one.",
            redirectTo: "/offers?tab=sent"
        });
    }

    const offer = await Offer.create({
        cattle: cattle._id,
        buyer: req.user._id,
        seller: cattle.farmer,
        amount,
        listedPrice: cattle.price,
        message: queryString(req.body?.message, 300),
        expiresAt: new Date(Date.now() + OFFER_TTL_DAYS * DAY_MS)
    });

    await notify(cattle.farmer, {
        type: "offer_received",
        title: `New offer: ${rupees(amount)} for ${cattle.name || cattle.breedName}`,
        body: `${req.user.fullName} offered ${rupees(amount)} (listed ${rupees(cattle.price)}).`,
        link: "/offers?tab=received"
    });

    return respond(req, res, {
        status: 201,
        redirectTo: "/offers?tab=sent",
        data: { id: String(offer._id) },
        message: "Offer sent to the seller"
    });
});

export const listOffers = asyncHandler(async (req, res) => {
    const tab = req.query.tab === "received" ? "received" : "sent";

    await expireOldOffers({ $or: [{ buyer: req.user._id }, { seller: req.user._id }] });

    const populate = [
        { path: "cattle", select: "name breedName imageUrl images price sold" },
        { path: "buyer", select: "fullName username avatar" },
        { path: "seller", select: "fullName username avatar" }
    ];

    const [sent, received] = await Promise.all([
        Offer.find({ buyer: req.user._id }).sort({ _id: -1 }).limit(LIST_LIMIT).populate(populate).lean(),
        Offer.find({ seller: req.user._id }).sort({ _id: -1 }).limit(LIST_LIMIT).populate(populate).lean()
    ]);

    return res.render("offers/index", {
        title: "Offers | BoviNetra",
        user: req.user,
        tab,
        sent,
        received,
        pendingReceived: received.filter((offer) => offer.status === OFFER_STATUS.PENDING).length,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const loadOwnedOffer = async (req, field) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, "Invalid offer id");

    const offer = await Offer.findOne({ _id: req.params.id, [field]: req.user._id }).populate(
        "cattle",
        "name breedName price sold isActive isDeleted"
    );

    if (!offer) throw new ApiError(404, "Offer not found");

    if (offer.status === OFFER_STATUS.PENDING && offer.expiresAt < new Date()) {
        offer.status = OFFER_STATUS.EXPIRED;
        offer.decidedAt = new Date();
        await offer.save();
    }

    return offer;
};

const settle = async (req, res, field, status, build) => {
    const offer = await loadOwnedOffer(req, field);
    const redirectTo = safeRedirect(req.body?.redirect, `/offers?tab=${field === "seller" ? "received" : "sent"}`);

    if (offer.status !== OFFER_STATUS.PENDING) {
        return reject(req, res, {
            status: 409,
            message: `This offer is already ${offer.status}`,
            redirectTo
        });
    }

    const problem = build.check?.(offer);

    if (problem) return reject(req, res, { status: 400, message: problem, redirectTo });

    offer.status = status;
    offer.decidedAt = new Date();
    offer.responseNote = queryString(req.body?.note, 300);
    await offer.save();

    await build.after?.(offer);

    return respond(req, res, {
        redirectTo,
        data: { status },
        message: build.message
    });
};

const cattleTitle = (offer) => offer.cattle?.name || offer.cattle?.breedName || "your cattle";

export const acceptOffer = asyncHandler(async (req, res) =>
    settle(req, res, "seller", OFFER_STATUS.ACCEPTED, {
        message: "Offer accepted. Message the buyer to finish the deal.",
        check: (offer) =>
            !offer.cattle || offer.cattle.sold || offer.cattle.isActive === false || offer.cattle.isDeleted
                ? "This cattle is no longer available"
                : "",
        after: (offer) =>
            notify(offer.buyer, {
                type: "offer_accepted",
                title: `Your offer was accepted: ${rupees(offer.amount)}`,
                body: `${cattleTitle(offer)} — message the seller to arrange the deal.`,
                link: `/chat?with=${offer.seller}`
            })
    })
);

export const rejectOffer = asyncHandler(async (req, res) =>
    settle(req, res, "seller", OFFER_STATUS.REJECTED, {
        message: "Offer declined",
        after: (offer) =>
            notify(offer.buyer, {
                type: "offer_rejected",
                title: `Your offer was declined: ${rupees(offer.amount)}`,
                body: offer.responseNote || `${cattleTitle(offer)} — you can send a new offer or message the seller.`,
                link: `/cattle/${offer.cattle?._id || ""}`
            })
    })
);

export const withdrawOffer = asyncHandler(async (req, res) =>
    settle(req, res, "buyer", OFFER_STATUS.WITHDRAWN, { message: "Offer withdrawn" })
);
