import mongoose from "mongoose";

import { Offer, OFFER_STATUS } from "../models/offer.model.js";
import { Order } from "../models/order.model.js";
import { SellerReview } from "../models/sellerReview.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, reject, respond } from "../utils/http.js";
import { notify } from "../services/notification.service.js";

const REVIEW_PAGE = 20;

export const recomputeRating = async (sellerId) => {
    const [summary] = await SellerReview.aggregate([
        { $match: { seller: new mongoose.Types.ObjectId(String(sellerId)) } },
        { $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);

    const avg = summary ? Math.round(summary.avg * 10) / 10 : 0;
    const count = summary ? summary.count : 0;

    await User.updateOne({ _id: sellerId }, { $set: { sellerRating: { avg, count } } });

    return { avg, count };
};

export const loadReviewPanel = async (seller, viewer) => {
    const reviews = await SellerReview.find({ seller: seller._id })
        .sort({ _id: -1 })
        .limit(REVIEW_PAGE)
        .populate("buyer", "fullName username avatar")
        .lean();

    let eligible = [];

    if (viewer && String(viewer._id) !== String(seller._id)) {
        const [orders, offers, done] = await Promise.all([
            Order.find({ user: viewer._id, seller: seller._id, orderStatus: "Delivered" })
                .select("orderNumber")
                .sort({ _id: -1 })
                .limit(20)
                .lean(),
            Offer.find({ buyer: viewer._id, seller: seller._id, status: OFFER_STATUS.ACCEPTED })
                .populate("cattle", "name breedName")
                .sort({ _id: -1 })
                .limit(20)
                .lean(),
            SellerReview.find({ buyer: viewer._id, seller: seller._id }).select("dealType dealId").lean()
        ]);

        const reviewed = new Set(done.map((item) => `${item.dealType}:${item.dealId}`));

        eligible = [
            ...orders.map((order) => ({ value: `order:${order._id}`, label: `Order ${order.orderNumber}` })),
            ...offers.map((offer) => ({
                value: `offer:${offer._id}`,
                label: `Cattle deal: ${offer.cattle?.name || offer.cattle?.breedName || "cattle"}`
            }))
        ].filter((item) => !reviewed.has(item.value));
    }

    return { reviews, eligible };
};

const findSeller = async (username) => {
    const seller = /^[a-z0-9_.]{3,30}$/.test(username)
        ? await User.findOne({ username, role: "farmer", isActive: { $ne: false } }).select("_id username fullName")
        : null;

    if (!seller) throw new ApiError(404, "Farmer not found");

    return seller;
};

export const createReview = asyncHandler(async (req, res) => {
    const seller = await findSeller(String(req.params.username || "").toLowerCase());
    const back = `/farmers/${seller.username}`;

    if (String(seller._id) === String(req.user._id)) {
        return reject(req, res, { status: 400, message: "You cannot review yourself", redirectTo: back });
    }

    const [dealType, dealId] = String(req.body?.deal || "").split(":");
    const rating = Number(req.body?.rating);

    if (!["order", "offer"].includes(dealType) || !isObjectId(dealId)) {
        return reject(req, res, { status: 400, message: "Choose which purchase you are reviewing", redirectTo: back });
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return reject(req, res, { status: 400, message: "Choose a rating from 1 to 5 stars", redirectTo: back });
    }

    const deal =
        dealType === "order"
            ? await Order.exists({ _id: dealId, user: req.user._id, seller: seller._id, orderStatus: "Delivered" })
            : await Offer.exists({ _id: dealId, buyer: req.user._id, seller: seller._id, status: OFFER_STATUS.ACCEPTED });

    if (!deal) {
        return reject(req, res, {
            status: 403,
            message: "You can review a seller only after a delivered order or an accepted offer",
            redirectTo: back
        });
    }

    try {
        await SellerReview.create({
            seller: seller._id,
            buyer: req.user._id,
            dealType,
            dealId,
            rating,
            comment: queryString(req.body?.comment, 500)
        });
    } catch (error) {
        if (error?.code === 11000) {
            return reject(req, res, { status: 409, message: "You already reviewed this purchase", redirectTo: back });
        }

        throw error;
    }

    const summary = await recomputeRating(seller._id);

    await notify(seller._id, {
        type: "review_received",
        title: `${req.user.fullName} rated you ${rating}/5`,
        body: queryString(req.body?.comment, 120),
        link: back
    });

    return respond(req, res, {
        status: 201,
        redirectTo: back,
        data: summary,
        message: "Thanks for your review"
    });
});

export const deleteReview = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, "Invalid review id");

    const review = await SellerReview.findById(req.params.id);

    if (!review) throw new ApiError(404, "Review not found");

    const isOwner = String(review.buyer) === String(req.user._id);
    const isAdmin = req.user.role?.toLowerCase() === "admin";

    if (!isOwner && !isAdmin) throw new ApiError(403, "You can only delete your own review");

    await review.deleteOne();
    await recomputeRating(review.seller);

    const seller = await User.findById(review.seller).select("username").lean();

    return respond(req, res, {
        redirectTo: seller ? `/farmers/${seller.username}` : "/products?type=cattle",
        data: {},
        message: "Review deleted"
    });
});
