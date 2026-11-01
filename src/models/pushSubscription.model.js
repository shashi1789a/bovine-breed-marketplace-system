import mongoose, { Schema } from "mongoose";

export const MAX_DEVICES_PER_USER = 10;

const pushSubscriptionSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        endpoint: { type: String, required: true, unique: true, maxlength: 1000 },
        keys: {
            p256dh: { type: String, required: true, maxlength: 200 },
            auth: { type: String, required: true, maxlength: 100 }
        },
        userAgent: { type: String, maxlength: 200, default: "" }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

export const PushSubscription =
    mongoose.models.PushSubscription || mongoose.model("PushSubscription", pushSubscriptionSchema);
