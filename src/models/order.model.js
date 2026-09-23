import mongoose, { Schema } from "mongoose";

export const ORDER_STATUS = Object.freeze({
    PENDING: "Pending",
    PLACED: "Placed",
    SHIPPED: "Shipped",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
});

export const PAYMENT_STATUS = Object.freeze({
    PENDING: "Pending",
    INITIATED: "Initiated",
    PAID: "Paid",
    FAILED: "Failed",
    REFUNDED: "Refunded"
});

export const PAYMENT_METHODS = Object.freeze({
    COD: "COD",
    RAZORPAY: "RAZORPAY"
});

export const REFUND_STATUS = Object.freeze({
    INITIATED: "Initiated",
    PROCESSED: "Processed",
    FAILED: "Failed"
});

export const PURCHASER_ROLES = Object.freeze(["user", "buyer", "farmer", "doctor"]);

const UNPAID_ORDER_TTL_SECONDS = 30 * 24 * 60 * 60;

const wholeNumber = {
    validator: Number.isInteger,
    message: "{PATH} must be a whole number"
};

const orderItemSchema = new Schema(
    {
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        name: { type: String, required: true, trim: true, maxlength: 200 },
        image: { type: String, default: "" },
        unit: { type: String, trim: true, maxlength: 30 },
        quantity: { type: Number, required: true, min: 1, validate: wholeNumber },
        price: { type: Number, required: true, min: 0 },
        lineTotal: { type: Number, required: true, min: 0 }
    },
    { _id: false }
);

const addressSchema = new Schema(
    {
        fullName: { type: String, required: true, trim: true, maxlength: 100 },
        phone: {
            type: String,
            required: true,
            trim: true,
            match: [/^[6-9]\d{9}$/, "Enter a valid 10 digit mobile number"]
        },
        line1: { type: String, required: true, trim: true, maxlength: 200 },
        line2: { type: String, trim: true, maxlength: 200 },
        landmark: { type: String, trim: true, maxlength: 100 },
        city: { type: String, required: true, trim: true, maxlength: 80 },
        state: { type: String, required: true, trim: true, maxlength: 80 },
        pincode: {
            type: String,
            required: true,
            trim: true,
            match: [/^[1-9]\d{5}$/, "Enter a valid 6 digit pincode"]
        }
    },
    { _id: false }
);

const refundSchema = new Schema(
    {
        id: String,
        amount: { type: Number, min: 0 },
        status: {
            type: String,
            enum: Object.values(REFUND_STATUS)
        },
        error: { type: String, maxlength: 300 },
        createdAt: Date
    },
    { _id: false }
);

const orderSchema = new Schema(
    {
        orderNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        checkoutId: {
            type: String,
            required: true,
            index: true
        },

        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        seller: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        sellerRole: {
            type: String,
            enum: ["farmer", "doctor", "admin"],
            required: true
        },

        items: {
            type: [orderItemSchema],
            validate: {
                validator: (value) => value.length > 0,
                message: "An order must contain at least one item"
            }
        },

        subtotal: { type: Number, required: true, min: 0 },
        shippingTotal: { type: Number, default: 0, min: 0 },
        totalAmount: { type: Number, required: true, min: 0 },

        shippingAddress: { type: addressSchema, required: true },

        paymentMethod: {
            type: String,
            enum: Object.values(PAYMENT_METHODS),
            required: true
        },

        paymentStatus: {
            type: String,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.PENDING
        },

        orderStatus: {
            type: String,
            enum: Object.values(ORDER_STATUS),
            default: ORDER_STATUS.PENDING
        },

        stockReserved: {
            type: Boolean,
            default: false
        },

        razorpayOrderId: String,
        razorpayPaymentId: String,
        paymentInstrument: String,
        paymentFailureReason: { type: String, maxlength: 200 },
        lockedUntil: Date,

        refund: refundSchema,

        placedAt: Date,
        paidAt: Date,
        shippedAt: Date,
        deliveredAt: Date,
        cancelledAt: Date,

        cancelledBy: {
            type: String,
            enum: ["buyer", "seller", "system"]
        },

        cancellationReason: { type: String, trim: true, maxlength: 300 }
    },
    { timestamps: true }
);

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ seller: 1, createdAt: -1 });
orderSchema.index({ "items.product": 1, createdAt: -1 });
orderSchema.index({ razorpayOrderId: 1 }, { sparse: true });
orderSchema.index({ "refund.id": 1 }, { sparse: true });
orderSchema.index(
    { createdAt: 1 },
    {
        expireAfterSeconds: UNPAID_ORDER_TTL_SECONDS,
        partialFilterExpression: {
            orderStatus: ORDER_STATUS.PENDING,
            paymentStatus: PAYMENT_STATUS.INITIATED
        }
    }
);

export const Order = mongoose.model("Order", orderSchema);