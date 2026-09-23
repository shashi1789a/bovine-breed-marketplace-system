import mongoose from "mongoose";

import { Product } from "../models/product.model.js";
import { Order, ORDER_STATUS, PAYMENT_STATUS, PAYMENT_METHODS } from "../models/order.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { wantsJson } from "../utils/session.js";
import {
    isObjectId,
    clampInt,
    queryString,
    buildPagination,
    respond,
    readFlash
} from "../utils/http.js";
import { getRazorpay, toPaise, razorpayErrorMessage } from "../utils/razorpay.js";

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;
const MAX_PAGE = 10000;

const FILTERABLE_STATUSES = Object.freeze([
    ORDER_STATUS.PLACED,
    ORDER_STATUS.SHIPPED,
    ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED
]);

const matchOption = (values, raw) => {
    const normalized = queryString(raw).toLowerCase();
    return values.find((item) => item.toLowerCase() === normalized) || "";
};

const findSellerOrder = async (id, sellerId) => {
    if (!isObjectId(id)) {
        throw new ApiError(400, "Invalid order id");
    }

    const order = await Order.findOne({ _id: id, seller: sellerId });

    if (!order) {
        throw new ApiError(404, "Order not found");
    }

    return order;
};

const sellerOrdersPage = asyncHandler(async (req, res) => {
    const page = clampInt(req.query.page, 1, 1, MAX_PAGE);
    const limit = clampInt(req.query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    const status = matchOption(FILTERABLE_STATUSES, req.query.status);

    const filter = {
        seller: req.user._id,
        orderStatus: status || { $ne: ORDER_STATUS.PENDING }
    };

    const [orders, total] = await Promise.all([
        Order.find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .populate("user", "fullName")
            .lean(),
        Order.countDocuments(filter)
    ]);

    const payload = {
        orders,
        pagination: buildPagination(page, limit, total),
        filters: { status },
        statuses: FILTERABLE_STATUSES
    };

    if (wantsJson(req)) {
        return res
            .status(200)
            .json(new ApiResponse(200, payload, "Orders fetched successfully"));
    }

    return res.status(200).render("seller/orders", {
        title: "Orders",
        user: req.user,
        ...payload,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const getSellerOrderById = asyncHandler(async (req, res) => {
    const order = await findSellerOrder(req.params.id, req.user._id);
    const populated = await order.populate("user", "fullName username");

    if (wantsJson(req)) {
        return res
            .status(200)
            .json(new ApiResponse(200, populated, "Order fetched successfully"));
    }

    return res.status(200).render("seller/order-details", {
        title: `Order ${order.orderNumber}`,
        user: req.user,
        order: populated
    });
});

const markOrderShipped = asyncHandler(async (req, res) => {
    const order = await findSellerOrder(req.params.id, req.user._id);

    if (order.orderStatus !== ORDER_STATUS.PLACED) {
        throw new ApiError(400, "Only placed orders can be marked as shipped");
    }

    order.orderStatus = ORDER_STATUS.SHIPPED;
    order.shippedAt = new Date();

    await order.save();

    return respond(req, res, {
        redirectTo: "/orders",
        data: { id: order._id },
        message: "Order marked as shipped"
    });
});

const markOrderDelivered = asyncHandler(async (req, res) => {
    const order = await findSellerOrder(req.params.id, req.user._id);

    if (order.orderStatus !== ORDER_STATUS.SHIPPED) {
        throw new ApiError(400, "Only shipped orders can be marked as delivered");
    }

    order.orderStatus = ORDER_STATUS.DELIVERED;
    order.deliveredAt = new Date();

    if (
        order.paymentMethod === PAYMENT_METHODS.COD &&
        order.paymentStatus === PAYMENT_STATUS.PENDING
    ) {
        order.paymentStatus = PAYMENT_STATUS.PAID;
        order.paidAt = new Date();
    }

    await order.save();

    return respond(req, res, {
        redirectTo: "/orders",
        data: { id: order._id },
        message: "Order marked as delivered"
    });
});

const sellerCancelOrder = asyncHandler(async (req, res) => {
    const order = await findSellerOrder(req.params.id, req.user._id);

    if (![ORDER_STATUS.PENDING, ORDER_STATUS.PLACED].includes(order.orderStatus)) {
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
            if (order.stockReserved) {
                for (const item of order.items) {
                    await Product.updateOne(
                        { _id: item.product },
                        { $inc: { stock: item.quantity, soldCount: -item.quantity } },
                        { session }
                    );
                }
            }

            order.orderStatus = ORDER_STATUS.CANCELLED;
            order.stockReserved = false;
            order.cancelledAt = new Date();
            order.cancelledBy = "seller";
            order.cancellationReason =
                typeof req.body?.reason === "string"
                    ? req.body.reason.trim().slice(0, 300)
                    : undefined;

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
    sellerOrdersPage,
    getSellerOrderById,
    markOrderShipped,
    markOrderDelivered,
    sellerCancelOrder
};