import crypto from "crypto";
import mongoose from "mongoose";

import { Cart } from "../models/cart.model.js";
import { Product, APPROVAL_STATUS } from "../models/product.model.js";
import {
    Order,
    ORDER_STATUS,
    PAYMENT_STATUS,
    PAYMENT_METHODS
} from "../models/order.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { wantsJson } from "../utils/session.js";
import {
    isObjectId,
    clampInt,
    buildPagination,
    respond,
    readFlash
} from "../utils/http.js";
import { generateOrderNumber } from "../utils/orderNumber.js";
import {
    getRazorpay,
    toPaise,
    verifyPaymentSignature,
    verifyWebhookSignature,
    razorpayErrorMessage
} from "../utils/razorpay.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 10000;
const RESERVATION_MINUTES = 15;
const OPEN_STATUSES = Object.freeze([ORDER_STATUS.PENDING, ORDER_STATUS.PLACED]);

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const readText = (value) => (typeof value === "string" ? value.trim() : "");

const addressFields = Object.freeze([
    ["fullName", 100, /.+/],
    ["phone", 10, /^[6-9]\d{9}$/],
    ["line1", 200, /.+/],
    ["city", 80, /.+/],
    ["state", 80, /.+/],
    ["pincode", 6, /^[1-9]\d{5}$/]
]);

const parseAddress = (body) => {
    const source = body && typeof body === "object" ? body : {};
    const address = {
        line2: readText(source.line2).slice(0, 200),
        landmark: readText(source.landmark).slice(0, 100)
    };
    const errors = [];

    for (const [field, max, pattern] of addressFields) {
        const value = readText(source[field]);

        if (!value || value.length > max || !pattern.test(value)) {
            errors.push(`A valid ${field} is required.`);
            continue;
        }

        address[field] = value;
    }

    return { address, errors };
};

const loadCartForCheckout = async (userId) => {
    const cart = await Cart.findOne({ user: userId });

    if (!cart || cart.items.length === 0) {
        throw new ApiError(400, "Your cart is empty");
    }

    return cart;
};

const previewGroups = async (cartItems) => {
    const groups = new Map();

    for (const item of cartItems) {
        const product = await Product.findById(item.product);

        if (
            !product ||
            !product.isActive ||
            product.approvalStatus !== APPROVAL_STATUS.APPROVED
        ) {
            throw new ApiError(400, "One or more items are no longer available");
        }

        if (product.expiryDate && product.expiryDate.getTime() <= Date.now()) {
            throw new ApiError(400, `${product.name} has expired`);
        }

        if (product.stock < item.quantity) {
            throw new ApiError(400, `${product.name} is out of stock`);
        }

        const key = String(product.owner);
        const shipping = product.freeShipping ? 0 : product.shippingCharge || 0;
        const lineTotal = round2(product.price * item.quantity);

        if (!groups.has(key)) {
            groups.set(key, {
                sellerId: product.owner,
                sellerRole: product.ownerRole,
                items: [],
                subtotal: 0,
                shippingTotal: 0
            });
        }

        const group = groups.get(key);

        group.items.push({
            product: product._id,
            name: product.name,
            image: product.image || "",
            unit: product.unit,
            quantity: item.quantity,
            price: product.price,
            lineTotal
        });

        group.subtotal = round2(group.subtotal + lineTotal);
        group.shippingTotal = round2(group.shippingTotal + shipping);
    }

    return [...groups.values()];
};

const reserveStockAndCreateOrders = async ({
    session,
    userId,
    address,
    paymentMethod,
    checkoutId,
    groups
}) => {
    const now = new Date();
    const isCod = paymentMethod === PAYMENT_METHODS.COD;

    const orders = [];

    for (const group of groups) {
        for (const item of group.items) {
            const decrement = await Product.updateOne(
                { _id: item.product, stock: { $gte: item.quantity } },
                { $inc: { stock: -item.quantity, soldCount: item.quantity } },
                { session }
            );

            if (decrement.modifiedCount !== 1) {
                throw new ApiError(409, `${item.name} went out of stock. Please try again.`);
            }
        }

        const totalAmount = round2(group.subtotal + group.shippingTotal);

        const [order] = await Order.create(
            [
                {
                    orderNumber: generateOrderNumber(),
                    checkoutId,
                    user: userId,
                    seller: group.sellerId,
                    sellerRole: group.sellerRole,
                    items: group.items,
                    subtotal: group.subtotal,
                    shippingTotal: group.shippingTotal,
                    totalAmount,
                    shippingAddress: address,
                    paymentMethod,
                    paymentStatus: isCod
                        ? PAYMENT_STATUS.PENDING
                        : PAYMENT_STATUS.INITIATED,
                    orderStatus: isCod ? ORDER_STATUS.PLACED : ORDER_STATUS.PENDING,
                    stockReserved: true,
                    placedAt: isCod ? now : undefined,
                    lockedUntil: isCod
                        ? undefined
                        : new Date(now.getTime() + RESERVATION_MINUTES * 60 * 1000)
                }
            ],
            { session }
        );

        orders.push(order);
    }

    return orders;
};

const showCheckoutPage = asyncHandler(async (req, res) => {
    const cart = await loadCartForCheckout(req.user._id);
    const groups = await previewGroups(cart.items);

    const totalAmount = round2(
        groups.reduce((sum, group) => sum + group.subtotal + group.shippingTotal, 0)
    );

    return res.status(200).render("checkout/index", {
        title: "Checkout",
        user: req.user,
        groups,
        totalAmount,
        error: readFlash(req.query.error)
    });
});

const placeOrderCOD = asyncHandler(async (req, res) => {
    const cart = await loadCartForCheckout(req.user._id);
    const { address, errors } = parseAddress(req.body);

    if (errors.length) {
        throw new ApiError(400, errors.join(" "));
    }

    const groups = await previewGroups(cart.items);
    const checkoutId = crypto.randomUUID();

    const session = await mongoose.startSession();
    let orders;

    try {
        await session.withTransaction(async () => {
            orders = await reserveStockAndCreateOrders({
                session,
                userId: req.user._id,
                address,
                paymentMethod: PAYMENT_METHODS.COD,
                checkoutId,
                groups
            });

            await Cart.updateOne(
                { _id: cart._id },
                { $set: { items: [], totalItems: 0, totalQuantity: 0, totalAmount: 0 } },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    return respond(req, res, {
        status: 201,
        redirectTo: "/orders",
        data: { checkoutId, orders },
        message: "Order placed successfully"
    });
});

const createRazorpayCheckout = asyncHandler(async (req, res) => {
    const cart = await loadCartForCheckout(req.user._id);
    const { address, errors } = parseAddress(req.body);

    if (errors.length) {
        throw new ApiError(400, errors.join(" "));
    }

    const groups = await previewGroups(cart.items);

    const totalAmount = round2(
        groups.reduce((sum, group) => sum + group.subtotal + group.shippingTotal, 0)
    );

    if (totalAmount <= 0) {
        throw new ApiError(400, "Order amount must be greater than zero");
    }

    const checkoutId = crypto.randomUUID();

    let razorpayOrder;

    try {
        razorpayOrder = await getRazorpay().orders.create({
            amount: toPaise(totalAmount),
            currency: "INR",
            receipt: checkoutId,
            notes: { checkoutId, userId: String(req.user._id) }
        });
    } catch (error) {
        throw new ApiError(502, razorpayErrorMessage(error));
    }

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            await reserveStockAndCreateOrders({
                session,
                userId: req.user._id,
                address,
                paymentMethod: PAYMENT_METHODS.RAZORPAY,
                checkoutId,
                groups
            });

            await Order.updateMany(
                { checkoutId },
                { $set: { razorpayOrderId: razorpayOrder.id } },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                checkoutId,
                razorpayOrderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            },
            "Razorpay order created successfully"
        )
    );
});

const verifyRazorpayPayment = asyncHandler(async (req, res) => {
    const razorpayOrderId = readText(req.body?.razorpay_order_id);
    const razorpayPaymentId = readText(req.body?.razorpay_payment_id);
    const signature = readText(req.body?.razorpay_signature);

    if (!razorpayOrderId || !razorpayPaymentId || !signature) {
        throw new ApiError(400, "Incomplete payment verification data");
    }

    const valid = verifyPaymentSignature({
        razorpayOrderId,
        razorpayPaymentId,
        signature
    });

    if (!valid) {
        throw new ApiError(400, "Payment verification failed");
    }

    const orders = await Order.find({
        razorpayOrderId,
        user: req.user._id,
        paymentStatus: PAYMENT_STATUS.INITIATED
    });

    if (!orders.length) {
        throw new ApiError(404, "No pending order found for this payment");
    }

    const now = new Date();

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            await Order.updateMany(
                { razorpayOrderId, paymentStatus: PAYMENT_STATUS.INITIATED },
                {
                    $set: {
                        paymentStatus: PAYMENT_STATUS.PAID,
                        orderStatus: ORDER_STATUS.PLACED,
                        razorpayPaymentId,
                        paidAt: now,
                        placedAt: now
                    },
                    $unset: { lockedUntil: "" }
                },
                { session }
            );

            await Cart.updateOne(
                { user: req.user._id },
                { $set: { items: [], totalItems: 0, totalQuantity: 0, totalAmount: 0 } },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { checkoutId: orders[0].checkoutId, orderCount: orders.length },
            "Payment verified successfully"
        )
    );
});

const restoreStockForOrders = async (orders, session) => {
    for (const order of orders) {
        if (!order.stockReserved) continue;

        for (const item of order.items) {
            await Product.updateOne(
                { _id: item.product },
                { $inc: { stock: item.quantity, soldCount: -item.quantity } },
                { session }
            );
        }
    }
};

const releaseExpiredReservations = async () => {
    const now = new Date();

    const expired = await Order.find({
        orderStatus: ORDER_STATUS.PENDING,
        paymentStatus: PAYMENT_STATUS.INITIATED,
        stockReserved: true,
        lockedUntil: { $lte: now }
    });

    if (!expired.length) return 0;

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            await restoreStockForOrders(expired, session);

            await Order.updateMany(
                { _id: { $in: expired.map((order) => order._id) } },
                {
                    $set: {
                        orderStatus: ORDER_STATUS.CANCELLED,
                        paymentStatus: PAYMENT_STATUS.FAILED,
                        stockReserved: false,
                        cancelledAt: now,
                        cancelledBy: "system",
                        cancellationReason: "Payment was not completed in time"
                    }
                },
                { session }
            );
        });
    } finally {
        await session.endSession();
    }

    return expired.length;
};

const razorpayWebhook = asyncHandler(async (req, res) => {
    const signature = req.header("X-Razorpay-Signature");
    const valid = verifyWebhookSignature(req.body, signature);

    if (!valid) {
        throw new ApiError(400, "Invalid webhook signature");
    }

    const payload = JSON.parse(req.body.toString("utf8"));
    const event = payload?.event;

    const razorpayOrderId =
        payload?.payload?.payment?.entity?.order_id ||
        payload?.payload?.order?.entity?.id;

    if (!razorpayOrderId) {
        return res.status(200).json({ received: true });
    }

    if (event === "payment.captured" || event === "order.paid") {
        const paymentId = payload?.payload?.payment?.entity?.id;
        const now = new Date();

        const session = await mongoose.startSession();

        try {
            await session.withTransaction(async () => {
                await Order.updateMany(
                    { razorpayOrderId, paymentStatus: PAYMENT_STATUS.INITIATED },
                    {
                        $set: {
                            paymentStatus: PAYMENT_STATUS.PAID,
                            orderStatus: ORDER_STATUS.PLACED,
                            razorpayPaymentId: paymentId,
                            paidAt: now,
                            placedAt: now
                        },
                        $unset: { lockedUntil: "" }
                    },
                    { session }
                );
            });
        } finally {
            await session.endSession();
        }
    }

    if (event === "payment.failed") {
        const reason = payload?.payload?.payment?.entity?.error_description;

        const orders = await Order.find({
            razorpayOrderId,
            paymentStatus: PAYMENT_STATUS.INITIATED
        });

        if (orders.length) {
            const session = await mongoose.startSession();

            try {
                await session.withTransaction(async () => {
                    await restoreStockForOrders(orders, session);

                    await Order.updateMany(
                        { _id: { $in: orders.map((order) => order._id) } },
                        {
                            $set: {
                                orderStatus: ORDER_STATUS.CANCELLED,
                                paymentStatus: PAYMENT_STATUS.FAILED,
                                stockReserved: false,
                                paymentFailureReason: (reason || "").slice(0, 200),
                                cancelledAt: new Date(),
                                cancelledBy: "system",
                                cancellationReason: "Payment failed"
                            }
                        },
                        { session }
                    );
                });
            } finally {
                await session.endSession();
            }
        }
    }

    return res.status(200).json({ received: true });
});

const myOrders = asyncHandler(async (req, res) => {
    const page = clampInt(req.query.page, 1, 1, MAX_PAGE);
    const limit = clampInt(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    const filter = { user: req.user._id, orderStatus: { $ne: ORDER_STATUS.PENDING } };

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("seller", "fullName username")
            .lean(),
        Order.countDocuments(filter)
    ]);

    const payload = { orders, pagination: buildPagination(page, limit, total) };

    if (wantsJson(req)) {
        return res
            .status(200)
            .json(new ApiResponse(200, payload, "Orders fetched successfully"));
    }

    return res.status(200).render("orders/index", {
        title: "My Orders",
        user: req.user,
        ...payload,
        success: readFlash(req.query.success)
    });
});

const getOrderById = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) {
        throw new ApiError(400, "Invalid order id");
    }

    const order = await Order.findOne({ _id: req.params.id, user: req.user._id })
        .populate("seller", "fullName username")
        .lean();

    if (!order) {
        throw new ApiError(404, "Order not found");
    }

    if (wantsJson(req)) {
        return res
            .status(200)
            .json(new ApiResponse(200, order, "Order fetched successfully"));
    }

    return res.status(200).render("orders/show", {
        title: `Order ${order.orderNumber}`,
        user: req.user,
        order
    });
});

const cancelOrder = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) {
        throw new ApiError(400, "Invalid order id");
    }

    const order = await Order.findOne({ _id: req.params.id, user: req.user._id });

    if (!order) {
        throw new ApiError(404, "Order not found");
    }

    if (!OPEN_STATUSES.includes(order.orderStatus)) {
        throw new ApiError(400, "This order can no longer be cancelled");
    }

    const shouldRefund = order.paymentStatus === PAYMENT_STATUS.PAID;

    if (shouldRefund) {
        try {
            const refund = await getRazorpay().payments.refund(order.razorpayPaymentId, {
                amount: toPaise(order.totalAmount)
            });

            order.refund = {
                id: refund.id,
                amount: order.totalAmount,
                status: "Initiated",
                createdAt: new Date()
            };
            order.paymentStatus = PAYMENT_STATUS.REFUNDED;
        } catch (error) {
            throw new ApiError(502, razorpayErrorMessage(error));
        }
    }

    const session = await mongoose.startSession();

    try {
        await session.withTransaction(async () => {
            await restoreStockForOrders([order], session);

            order.orderStatus = ORDER_STATUS.CANCELLED;
            order.stockReserved = false;
            order.cancelledAt = new Date();
            order.cancelledBy = "buyer";
            order.cancellationReason = readText(req.body?.reason).slice(0, 300) || undefined;

            await order.save({ session });
        });
    } finally {
        await session.endSession();
    }

    return respond(req, res, {
        redirectTo: "/orders",
        data: { id: order._id },
        message: shouldRefund
            ? "Order cancelled. Refund has been initiated."
            : "Order cancelled successfully"
    });
});

export {
    showCheckoutPage,
    placeOrderCOD,
    createRazorpayCheckout,
    verifyRazorpayPayment,
    razorpayWebhook,
    releaseExpiredReservations,
    myOrders,
    getOrderById,
    cancelOrder
};