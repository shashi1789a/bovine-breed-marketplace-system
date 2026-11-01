import mongoose, { Schema } from "mongoose";

export const OFFER_STATUS = Object.freeze({
    PENDING: "pending",
    ACCEPTED: "accepted",
    REJECTED: "rejected",
    WITHDRAWN: "withdrawn",
    EXPIRED: "expired"
});

export const OFFER_TTL_DAYS = 7;
export const MIN_OFFER_RATIO = 0.3;

const offerSchema = new Schema(
    {
        cattle: { type: Schema.Types.ObjectId, ref: "Cattle", required: true },
        buyer: { type: Schema.Types.ObjectId, ref: "User", required: true },
        seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
        amount: { type: Number, required: true, min: 1 },
        listedPrice: { type: Number, required: true, min: 0 },
        message: { type: String, trim: true, maxlength: 300, default: "" },
        status: {
            type: String,
            enum: Object.values(OFFER_STATUS),
            default: OFFER_STATUS.PENDING
        },
        responseNote: { type: String, trim: true, maxlength: 300, default: "" },
        decidedAt: Date,
        expiresAt: { type: Date, required: true }
    },
    { timestamps: true }
);

offerSchema.index({ buyer: 1, _id: -1 });
offerSchema.index({ seller: 1, _id: -1 });
offerSchema.index({ cattle: 1, buyer: 1, status: 1 });

export const Offer = mongoose.models.Offer || mongoose.model("Offer", offerSchema);
