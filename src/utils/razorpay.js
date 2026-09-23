import crypto from "crypto";
import Razorpay from "razorpay";

import { ApiError } from "./ApiError.js";

let client = null;

export const getRazorpay = () => {
    if (client) return client;

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        throw new ApiError(503, "Online payments are currently unavailable.");
    }

    client = new Razorpay({ key_id: keyId, key_secret: keySecret });

    return client;
};

export const toPaise = (amount) => Math.round(Number(amount) * 100);

const safeEqual = (expected, received) => {
    const expectedBuffer = Buffer.from(String(expected));
    const receivedBuffer = Buffer.from(String(received));

    return (
        expectedBuffer.length === receivedBuffer.length &&
        crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    );
};

export const verifyPaymentSignature = ({
    razorpayOrderId,
    razorpayPaymentId,
    signature
}) => {
    const secret = process.env.RAZORPAY_KEY_SECRET;

    if (!secret || typeof signature !== "string") return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(`${razorpayOrderId}|${razorpayPaymentId}`)
        .digest("hex");

    return safeEqual(expected, signature);
};

export const verifyWebhookSignature = (rawBody, signature) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!secret || typeof signature !== "string") return false;

    const expected = crypto
        .createHmac("sha256", secret)
        .update(rawBody)
        .digest("hex");

    return safeEqual(expected, signature);
};

export const razorpayErrorMessage = (error) =>
    error?.error?.description || error?.message || "Payment provider error";