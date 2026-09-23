import crypto from "crypto";

export const generateOrderNumber = () =>
    `BN${Date.now().toString(36).toUpperCase()}${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;