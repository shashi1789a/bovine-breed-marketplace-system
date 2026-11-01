import mongoose, { Schema } from "mongoose";

export const MAX_SAVED_PRODUCTS = 200;

const productWishlistSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        priceAtSave: { type: Number, min: 0, default: null }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

productWishlistSchema.index({ user: 1, product: 1 }, { unique: true });
productWishlistSchema.index({ product: 1 });

export const ProductWishlist =
    mongoose.models.ProductWishlist || mongoose.model("ProductWishlist", productWishlistSchema);
