import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";
import { passwordChangedAfter } from "../utils/session.js";
import { parseCookies } from "./socket.helpers.js";

/* Same rules as verifyJWT: valid token, active account, password not changed since. */
export const verifyAccessToken = async (token) => {
    if (!token || typeof token !== "string") return null;

    let decoded;

    try {
        decoded = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
    } catch {
        return null;
    }

    const user = await User.findById(decoded._id).select(
        "fullName username avatar role isActive passwordChangedAt"
    );

    if (!user || !user.isActive || passwordChangedAfter(user, decoded.iat)) return null;

    return {
        id: String(user._id),
        fullName: user.fullName,
        username: user.username,
        avatar: user.avatar,
        role: user.role
    };
};

export const authenticateSocket = async (socket, next) => {
    try {
        const cookies = parseCookies(socket.request.headers.cookie);
        const token = cookies.accessToken || socket.handshake.auth?.token;
        const user = await verifyAccessToken(token);

        if (!user) return next(new Error("unauthorized"));

        socket.data.user = user;

        return next();
    } catch (error) {
        console.error("[socket] authentication failed:", error.message);

        return next(new Error("unauthorized"));
    }
};
