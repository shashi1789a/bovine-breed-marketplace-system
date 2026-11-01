import mongoose, { Schema } from "mongoose";

export const DEAL_TYPES = Object.freeze(["order", "offer"]);

const sellerReviewSchema = new Schema(
    {
        seller: { type: Schema.Types.ObjectId, ref: "User", required: true },
        buyer: { type: Schema.Types.ObjectId, ref: "User", required: true },
        dealType: { type: String, enum: DEAL_TYPES, required: true },
        dealId: { type: Schema.Types.ObjectId, required: true },
        rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
        comment: { type: String, trim: true, maxlength: 500, default: "" }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

sellerReviewSchema.index({ buyer: 1, dealType: 1, dealId: 1 }, { unique: true });
sellerReviewSchema.index({ seller: 1, _id: -1 });

export const SellerReview =
    mongoose.models.SellerReview || mongoose.model("SellerReview", sellerReviewSchema);
