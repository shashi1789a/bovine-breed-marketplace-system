import { Cattle } from "../models/cattle.model.js";
import { Wishlist, MAX_SAVED_ITEMS } from "../models/wishlist.model.js";
import { Reel } from "../models/reel.model.js";
import { Product } from "../models/product.model.js";
import { ProductWishlist, MAX_SAVED_PRODUCTS } from "../models/productWishlist.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { wantsJson } from "../utils/session.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, readFlash, reject, respond, safeRedirect } from "../utils/http.js";

export const toggleWishlist = asyncHandler(async (req, res) => {
    const cattleId = String(req.body?.cattleId || "");
    const redirectTo = safeRedirect(req.body?.redirect, "/wishlist");

    if (!isObjectId(cattleId)) throw new ApiError(400, "Invalid cattle id");

    const existing = await Wishlist.findOne({ user: req.user._id, cattle: cattleId });

    if (existing) {
        await existing.deleteOne();

        return respond(req, res, {
            redirectTo,
            data: { saved: false },
            message: "Removed from saved"
        });
    }

    const cattle = await Cattle.findById(cattleId).select("farmer price isActive sold isDeleted").lean();

    if (!cattle || cattle.isDeleted || cattle.isActive === false || cattle.sold) {
        return reject(req, res, { status: 404, message: "This cattle is not available", redirectTo });
    }

    if (String(cattle.farmer) === String(req.user._id)) {
        return reject(req, res, { status: 400, message: "You cannot save your own cattle", redirectTo });
    }

    const total = await Wishlist.countDocuments({ user: req.user._id });

    if (total >= MAX_SAVED_ITEMS) {
        return reject(req, res, {
            status: 400,
            message: `You can save up to ${MAX_SAVED_ITEMS} cattle. Remove some first.`,
            redirectTo
        });
    }

    let reelId = null;

    if (isObjectId(String(req.body?.reelId || ""))) {
        const reel = await Reel.findOne({ _id: req.body.reelId, cattle: cattleId }).select("_id").lean();
        reelId = reel ? reel._id : null;
    }

    await Wishlist.updateOne(
        { user: req.user._id, cattle: cattleId },
        {
            $setOnInsert: {
                user: req.user._id,
                cattle: cattleId,
                reel: reelId,
                priceAtSave: typeof cattle.price === "number" ? cattle.price : null
            }
        },
        { upsert: true }
    );

    return respond(req, res, {
        status: 201,
        redirectTo,
        data: { saved: true },
        message: "Saved. We will tell you if the price drops or it is sold."
    });
});

export const toggleProductWishlist = asyncHandler(async (req, res) => {
    const productId = String(req.body?.productId || "");
    const redirectTo = safeRedirect(req.body?.redirect, "/wishlist");

    if (!isObjectId(productId)) throw new ApiError(400, "Invalid product id");

    const existing = await ProductWishlist.findOne({ user: req.user._id, product: productId });

    if (existing) {
        await existing.deleteOne();

        return respond(req, res, { redirectTo, data: { saved: false }, message: "Removed from wishlist" });
    }

    const product = await Product.findById(productId).select("owner price isActive approvalStatus").lean();

    if (!product || product.isActive === false || product.approvalStatus !== "Approved") {
        return reject(req, res, { status: 404, message: "This product is not available", redirectTo });
    }

    if (String(product.owner) === String(req.user._id)) {
        return reject(req, res, { status: 400, message: "You cannot save your own product", redirectTo });
    }

    const total = await ProductWishlist.countDocuments({ user: req.user._id });

    if (total >= MAX_SAVED_PRODUCTS) {
        return reject(req, res, {
            status: 400,
            message: `You can save up to ${MAX_SAVED_PRODUCTS} products. Remove some first.`,
            redirectTo
        });
    }

    await ProductWishlist.updateOne(
        { user: req.user._id, product: productId },
        { $setOnInsert: { user: req.user._id, product: productId, priceAtSave: product.price } },
        { upsert: true }
    );

    return respond(req, res, { status: 201, redirectTo, data: { saved: true }, message: "Saved to your wishlist" });
});

export const showWishlist = asyncHandler(async (req, res) => {
    const productRows = await ProductWishlist.find({ user: req.user._id })
        .sort({ _id: -1 })
        .limit(MAX_SAVED_PRODUCTS)
        .populate("product", "name image price stock unit isActive approvalStatus expiryDate")
        .lean();

    const products = productRows
        .filter((row) => row.product)
        .map((row) => {
            const product = row.product;
            const expired = product.expiryDate && new Date(product.expiryDate).getTime() <= Date.now();
            const available =
                product.isActive !== false && product.approvalStatus === "Approved" && product.stock > 0 && !expired;

            return {
                product,
                available,
                priceChange:
                    typeof row.priceAtSave === "number" && typeof product.price === "number"
                        ? product.price - row.priceAtSave
                        : 0
            };
        });

    const rows = await Wishlist.find({ user: req.user._id })
        .sort({ _id: -1 })
        .limit(MAX_SAVED_ITEMS)
        .populate("cattle", "name breedName category gender age price imageUrl images sold isActive isDeleted")
        .lean();

    const items = rows
        .filter((row) => row.cattle)
        .map((row) => {
            const cattle = row.cattle;
            const available = !cattle.isDeleted && cattle.isActive !== false && !cattle.sold;
            const hasPrices = typeof row.priceAtSave === "number" && typeof cattle.price === "number";

            return {
                cattle,
                reelId: row.reel,
                available,
                sold: Boolean(cattle.sold),
                priceChange: hasPrices ? cattle.price - row.priceAtSave : 0,
                savedAt: row.createdAt
            };
        });

    if (wantsJson(req)) {
        return res.status(200).json(new ApiResponse(200, { items, products }, "Wishlist fetched"));
    }

    return res.render("wishlist/index", {
        title: "Wishlist | BoviNetra",
        user: req.user,
        items,
        products,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});
