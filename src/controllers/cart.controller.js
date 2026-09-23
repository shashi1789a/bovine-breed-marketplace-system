import { Cart, MAX_CART_ITEMS, MAX_QUANTITY_PER_ITEM } from "../models/cart.model.js";
import { Product, APPROVAL_STATUS } from "../models/product.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { wantsJson } from "../utils/session.js";
import { isObjectId, respond } from "../utils/http.js";

const CART_HOME = "/cart";

const readQuantity = (value, fallback = 1) => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) return fallback;

    return Math.min(Math.max(parsed, 1), MAX_QUANTITY_PER_ITEM);
};

const findPurchasableProduct = async (productId, buyerId) => {
    if (!isObjectId(productId)) {
        throw new ApiError(400, "Invalid product id");
    }

    const product = await Product.findById(productId);

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    if (String(product.owner) === String(buyerId)) {
        throw new ApiError(400, "You cannot buy your own product");
    }

    if (!product.isActive || product.approvalStatus !== APPROVAL_STATUS.APPROVED) {
        throw new ApiError(400, "This product is not available for purchase");
    }

    if (product.expiryDate && product.expiryDate.getTime() <= Date.now()) {
        throw new ApiError(400, "This product has expired");
    }

    if (product.stock <= 0) {
        throw new ApiError(400, "This product is out of stock");
    }

    return product;
};

const getOrCreateCart = async (userId) => {
    const cart = await Cart.findOne({ user: userId });
    return cart || new Cart({ user: userId, items: [] });
};

const annotateCartItems = (cart) =>
    cart.items.map((item) => {
        const product = item.product;

        const issues = [];

        if (!product) {
            issues.push("This product is no longer available.");
        } else {
            if (!product.isActive || product.approvalStatus !== APPROVAL_STATUS.APPROVED) {
                issues.push("This product is no longer available.");
            }

            if (product.expiryDate && product.expiryDate.getTime() <= Date.now()) {
                issues.push("This product has expired.");
            }

            if (product.stock <= 0) {
                issues.push("Out of stock.");
            } else if (product.stock < item.quantity) {
                issues.push(`Only ${product.stock} left in stock.`);
            }

            if (product.price !== item.price) {
                issues.push(
                    `Price changed from ₹${item.price} to ₹${product.price}.`
                );
            }
        }

        return {
            product,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice,
            issues
        };
    });

const addToCart = asyncHandler(async (req, res) => {
    const product = await findPurchasableProduct(req.params.productId, req.user._id);
    const requested = readQuantity(req.body?.quantity);

    const cart = await getOrCreateCart(req.user._id);

    const existingItem = cart.items.find(
        (item) => item.product.toString() === product._id.toString()
    );

    if (existingItem) {
        existingItem.quantity = Math.min(
            existingItem.quantity + requested,
            MAX_QUANTITY_PER_ITEM
        );
        existingItem.price = product.price;
    } else {
        if (cart.items.length >= MAX_CART_ITEMS) {
            throw new ApiError(
                400,
                `Your cart can hold at most ${MAX_CART_ITEMS} different products.`
            );
        }

        cart.items.push({
            product: product._id,
            seller: product.owner,
            sellerRole: product.ownerRole,
            quantity: requested,
            price: product.price,
            totalPrice: 0
        });
    }

    cart.calculateCart();
    await cart.save();

    return respond(req, res, {
        redirectTo: CART_HOME,
        data: { totalItems: cart.totalItems, totalQuantity: cart.totalQuantity },
        message: "Added to cart"
    });
});

const getMyCart = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id }).populate({
        path: "items.product",
        select: "name image price stock isActive approvalStatus expiryDate owner"
    });

    const items = cart ? annotateCartItems(cart) : [];

    const payload = {
        items,
        totalItems: cart?.totalItems || 0,
        totalQuantity: cart?.totalQuantity || 0,
        totalAmount: cart?.totalAmount || 0,
        hasIssues: items.some((item) => item.issues.length > 0)
    };

    if (wantsJson(req)) {
        return res
            .status(200)
            .json(new ApiResponse(200, payload, "Cart fetched successfully"));
    }

    return res.status(200).render("cart/index", {
        title: "My Cart",
        user: req.user,
        ...payload
    });
});

const updateCartItem = asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const quantity = readQuantity(req.body?.quantity, null);

    if (!quantity) {
        throw new ApiError(400, "Quantity must be between 1 and " + MAX_QUANTITY_PER_ITEM);
    }

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
        throw new ApiError(404, "Cart not found");
    }

    const item = cart.items.find((item) => item.product.toString() === productId);

    if (!item) {
        throw new ApiError(404, "Cart item not found");
    }

    item.quantity = quantity;

    cart.calculateCart();
    await cart.save();

    return respond(req, res, {
        redirectTo: CART_HOME,
        data: { totalAmount: cart.totalAmount },
        message: "Cart updated"
    });
});

const removeCartItem = asyncHandler(async (req, res) => {
    const { productId } = req.params;

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
        throw new ApiError(404, "Cart not found");
    }

    const before = cart.items.length;

    cart.items = cart.items.filter((item) => item.product.toString() !== productId);

    if (cart.items.length === before) {
        throw new ApiError(404, "Cart item not found");
    }

    cart.calculateCart();
    await cart.save();

    return respond(req, res, {
        redirectTo: CART_HOME,
        data: { totalItems: cart.totalItems },
        message: "Item removed from cart"
    });
});

const clearCart = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });

    if (cart) {
        cart.items = [];
        cart.calculateCart();
        await cart.save();
    }

    return respond(req, res, {
        redirectTo: CART_HOME,
        data: {},
        message: "Cart cleared"
    });
});

export { addToCart, getMyCart, updateCartItem, removeCartItem, clearCart };