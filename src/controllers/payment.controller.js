import mongoose from "mongoose";

import { Order } from "../models/order.model.js";
import { Cart } from "../models/cart.model.js";
import { Product } from "../models/product.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";


/* =========================================================
   CREATE PAYMENT ORDER
========================================================= */
const createPaymentOrder = asyncHandler(async (req, res) => {

    const { paymentMethod } = req.body;

    // Validate Payment Method
    const allowedMethods = [
        "COD",
        "UPI",
        "CARD",
        "NET_BANKING"
    ];

    if (
        !paymentMethod ||
        !allowedMethods.includes(paymentMethod)
    ) {
        throw new ApiError(
            400,
            "Invalid payment method"
        );
    }

    // Find User Cart
    const cart = await Cart.findOne({
        user: req.user?._id
    }).populate("items.product");

    // Cart Validation
    if (!cart || cart.items.length === 0) {
        throw new ApiError(
            400,
            "Cart is empty"
        );
    }

    // Check Product Stock
    for (const item of cart.items) {

        const product = await Product.findById(
            item.product._id
        );

        if (!product) {
            throw new ApiError(
                404,
                "Product not found"
            );
        }

        if (product.stock < item.quantity) {
            throw new ApiError(
                400,
                `${product.name} is out of stock`
            );
        }
    }

    // Calculate Total Amount
    const totalAmount = cart.items.reduce(
        (acc, item) =>
            acc + (item.price * item.quantity),
        0
    );

    // Create Pending Order
    const order = await Order.create({
        user: req.user?._id,
        items: cart.items,
        totalAmount,
        paymentMethod,
        paymentStatus:
            paymentMethod === "COD"
                ? "Pending"
                : "Initiated",
        orderStatus: "Pending"
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            {
                orderId: order._id,
                paymentMethod,
                totalAmount,
                paymentStatus: order.paymentStatus
            },
            "Payment order created successfully"
        )
    );
});


/* =========================================================
   VERIFY PAYMENT
========================================================= */
const verifyPayment = asyncHandler(async (req, res) => {

    const {
        orderId,
        transactionId
    } = req.body;

    // Validate Order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        throw new ApiError(
            400,
            "Invalid order id"
        );
    }

    // Find Order
    const order = await Order.findById(orderId);

    if (!order) {
        throw new ApiError(
            404,
            "Order not found"
        );
    }

    // Ownership Check
    if (
        order.user.toString() !==
        req.user?._id.toString()
    ) {
        throw new ApiError(
            403,
            "Unauthorized access"
        );
    }

    // Already Paid
    if (order.paymentStatus === "Paid") {
        throw new ApiError(
            400,
            "Payment already completed"
        );
    }

    // Update Payment Details
    order.paymentStatus = "Paid";
    order.orderStatus = "Placed";
    order.transactionId =
        transactionId || "TXN_" + Date.now();

    await order.save();

    // Reduce Product Stock
    for (const item of order.items) {

        await Product.findByIdAndUpdate(
            item.product,
            {
                $inc: {
                    stock: -item.quantity
                }
            }
        );
    }

    // Clear Cart
    const cart = await Cart.findOne({
        user: req.user?._id
    });

    if (cart) {
        cart.items = [];
        await cart.save();
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            order,
            "Payment verified successfully"
        )
    );
});


/* =========================================================
   PAYMENT FAILED
========================================================= */
const paymentFailed = asyncHandler(async (req, res) => {

    const {
        orderId,
        reason
    } = req.body;

    // Validate Order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        throw new ApiError(
            400,
            "Invalid order id"
        );
    }

    // Find Order
    const order = await Order.findById(orderId);

    if (!order) {
        throw new ApiError(
            404,
            "Order not found"
        );
    }

    // Update Payment Status
    order.paymentStatus = "Failed";
    order.failureReason =
        reason || "Payment failed";

    await order.save();

    return res.status(200).json(
        new ApiResponse(
            200,
            order,
            "Payment marked as failed"
        )
    );
});


/* =========================================================
   GET PAYMENT DETAILS
========================================================= */
const getPaymentDetails = asyncHandler(async (req, res) => {

    const { orderId } = req.params;

    // Validate Order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        throw new ApiError(
            400,
            "Invalid order id"
        );
    }

    // Find Order
    const order = await Order.findById(orderId)
        .populate("items.product")
        .populate(
            "user",
            "fullName email role"
        );

    if (!order) {
        throw new ApiError(
            404,
            "Order not found"
        );
    }

    // Ownership Check
    if (
        order.user._id.toString() !==
        req.user?._id.toString()
    ) {
        throw new ApiError(
            403,
            "Unauthorized access"
        );
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                orderId: order._id,
                transactionId:
                    order.transactionId,
                paymentMethod:
                    order.paymentMethod,
                paymentStatus:
                    order.paymentStatus,
                totalAmount:
                    order.totalAmount,
                orderStatus:
                    order.orderStatus,
                createdAt:
                    order.createdAt
            },
            "Payment details fetched successfully"
        )
    );
});


/* =========================================================
   CASH ON DELIVERY CONFIRM
========================================================= */
const confirmCODOrder = asyncHandler(async (req, res) => {

    const { orderId } = req.body;

    // Validate Order ID
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
        throw new ApiError(
            400,
            "Invalid order id"
        );
    }

    // Find Order
    const order = await Order.findById(orderId);

    if (!order) {
        throw new ApiError(
            404,
            "Order not found"
        );
    }

    // Check Payment Method
    if (order.paymentMethod !== "COD") {
        throw new ApiError(
            400,
            "This is not a COD order"
        );
    }

    // Update Order
    order.orderStatus = "Placed";
    order.paymentStatus = "Pending";

    await order.save();

    // Reduce Product Stock
    for (const item of order.items) {

        await Product.findByIdAndUpdate(
            item.product,
            {
                $inc: {
                    stock: -item.quantity
                }
            }
        );
    }

    // Clear Cart
    const cart = await Cart.findOne({
        user: req.user?._id
    });

    if (cart) {
        cart.items = [];
        await cart.save();
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            order,
            "COD order confirmed successfully"
        )
    );
});


export {
    createPaymentOrder,
    verifyPayment,
    paymentFailed,
    getPaymentDetails,
    confirmCODOrder
};