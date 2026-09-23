import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
    LOGIN_PATH,
    clearAuthCookies,
    passwordChangedAfter,
    rotateSession,
    wantsJson
} from "../utils/session.js";

const readAccessToken = (req) => {
    if (req.cookies?.accessToken) return req.cookies.accessToken;

    const header = req.header("Authorization");

    return header?.startsWith("Bearer ") ? header.slice(7).trim() : null;
};

const deny = (req, res, status, message) => {
    if (wantsJson(req)) {
        return res.status(status).json({ success: false, message });
    }

    clearAuthCookies(res);

    const target =
        req.method === "GET"
            ? `${LOGIN_PATH}?next=${encodeURIComponent(req.originalUrl)}`
            : LOGIN_PATH;

    return res.redirect(target);
};

const forbid = (req, res) => {
    if (wantsJson(req)) {
        return res.status(403).json({ success: false, message: "Access Denied" });
    }

    return res.status(403).render("403", {
        title: "Access Denied",
        message: "You are not allowed to access this page.",
        user: req.user
    });
};

const authenticate = async (req, res) => {
    const accessToken = readAccessToken(req);

    if (accessToken) {
        try {
            const decoded = jwt.verify(accessToken, process.env.ACCESS_TOKEN_SECRET);
            const user = await User.findById(decoded._id);

            if (user && user.isActive && !passwordChangedAfter(user, decoded.iat)) {
                return user;
            }
        } catch (error) {
            if (!(error instanceof jwt.JsonWebTokenError)) throw error;
        }
    }

    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) return null;

    const session = await rotateSession(res, refreshToken);

    return session ? session.user : null;
};

export const verifyJWT = asyncHandler(async (req, res, next) => {
    const user = await authenticate(req, res);

    if (!user) {
        return deny(req, res, 401, "Unauthorized. Please login.");
    }

    req.user = user;

    return next();
});

export const authorizeRoles = (...allowedRoles) => {
    const allowed = allowedRoles.map((role) => role.toLowerCase());

    return (req, res, next) => {
        if (!req.user?.role) {
            return deny(req, res, 401, "Unauthorized");
        }

        if (!allowed.includes(req.user.role.toLowerCase())) {
            return forbid(req, res);
        }

        return next();
    };
};

export const isAdmin = authorizeRoles("admin");
export const isFarmer = authorizeRoles("farmer");
export const isDoctor = authorizeRoles("doctor");
export const isBuyer = authorizeRoles("buyer");