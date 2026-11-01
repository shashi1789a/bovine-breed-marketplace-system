import { Wishlist } from "../models/wishlist.model.js";
import { Offer, OFFER_STATUS } from "../models/offer.model.js";
import { notifyMany } from "./notification.service.js";

const rupees = (value) => `₹ ${Number(value).toLocaleString("en-IN")}`;

export const handleCattleUpdate = async ({ before, cattle }) => {
    const title = cattle.name || cattle.breedName;
    const link = `/cattle/${cattle._id}`;
    const becameSold = !before.sold && cattle.sold === true;
    const priceDropped =
        typeof before.price === "number" &&
        typeof cattle.price === "number" &&
        cattle.price < before.price;

    if (becameSold) {
        const saved = await Wishlist.find({ cattle: cattle._id }).select("user").lean();

        await notifyMany(
            saved.map((item) => item.user).filter((id) => String(id) !== String(cattle.farmer)),
            {
                type: "cattle_sold",
                title: `${title} has been sold`,
                body: "This cattle is no longer available.",
                link
            }
        );

        const pending = await Offer.find({ cattle: cattle._id, status: OFFER_STATUS.PENDING })
            .select("buyer")
            .lean();

        if (pending.length) {
            await Offer.updateMany(
                { _id: { $in: pending.map((offer) => offer._id) } },
                { $set: { status: OFFER_STATUS.EXPIRED, decidedAt: new Date() } }
            );

            await notifyMany(
                pending.map((offer) => offer.buyer),
                {
                    type: "offer_expired",
                    title: `Your offer on ${title} has closed`,
                    body: "The cattle was sold to someone else.",
                    link: "/offers?tab=sent"
                }
            );
        }

        return;
    }

    if (priceDropped) {
        const saved = await Wishlist.find({ cattle: cattle._id }).select("user").lean();

        await notifyMany(
            saved.map((item) => item.user).filter((id) => String(id) !== String(cattle.farmer)),
            {
                type: "price_drop",
                title: `Price dropped on ${title}`,
                body: `Now ${rupees(cattle.price)}, was ${rupees(before.price)}.`,
                link
            }
        );
    }
};
