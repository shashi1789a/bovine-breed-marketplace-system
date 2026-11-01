import mongoose, { Schema } from "mongoose";

export const NOTIFICATION_TYPES = Object.freeze([
    "price_drop",
    "cattle_sold",
    "offer_received",
    "offer_accepted",
    "offer_rejected",
    "offer_expired",
    "review_received",
    "verification",
    "new_message",
    "order_new",
    "order_update",
    "new_reel",
    "reel_comment",
    "new_follower",
    "reminder",
    "appointment"
]);

const notificationSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: NOTIFICATION_TYPES, required: true },
        title: { type: String, required: true, trim: true, maxlength: 120 },
        body: { type: String, trim: true, maxlength: 300, default: "" },
        link: { type: String, trim: true, maxlength: 300, default: "" },
        readAt: { type: Date, default: null }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, readAt: 1, _id: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification =
    mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
