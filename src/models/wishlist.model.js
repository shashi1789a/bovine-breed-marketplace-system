import mongoose, { Schema } from "mongoose";

export const MAX_SAVED_ITEMS = 200;

const wishlistSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        cattle: { type: Schema.Types.ObjectId, ref: "Cattle", required: true },
        reel: { type: Schema.Types.ObjectId, ref: "Reel", default: null },
        priceAtSave: { type: Number, min: 0, default: null }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

wishlistSchema.index({ user: 1, cattle: 1 }, { unique: true });
wishlistSchema.index({ cattle: 1 });

export const Wishlist = mongoose.models.Wishlist || mongoose.model("Wishlist", wishlistSchema);
