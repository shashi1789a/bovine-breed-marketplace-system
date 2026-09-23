import { ApiResponse } from "./ApiResponse.js";
import { wantsJson } from "./session.js";

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const MAX_FLASH_LENGTH = 200;

export const isObjectId = (value) =>
    typeof value === "string" && OBJECT_ID_PATTERN.test(value);

export const clampInt = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

export const queryString = (value, max = 200) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

export const readFlash = (value) => queryString(value, MAX_FLASH_LENGTH) || null;

export const safeRedirect = (target, fallback) =>
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\") &&
    !/[\r\n]/.test(target)
        ? target
        : fallback;

export const buildPagination = (page, limit, total) => {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
};

const withParam = (url, key, value) =>
    `${url}${url.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(value)}`;

export const respond = (req, res, { status = 200, redirectTo, data = {}, message }) => {
    if (wantsJson(req)) {
        return res.status(status).json(new ApiResponse(status, data, message));
    }

    return res.redirect(withParam(redirectTo, "success", message));
};

export const reject = (
    req,
    res,
    { status = 400, message, redirectTo, extra = {} }
) => {
    if (wantsJson(req)) {
        return res.status(status).json({ success: false, message, ...extra });
    }

    return res.redirect(withParam(redirectTo, "error", message));
};