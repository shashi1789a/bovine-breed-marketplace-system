import jwt from "jsonwebtoken";

import { User } from "../models/user.model.js";

export const LOGIN_PATH = "/login";

const cookieBase = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
});

const cookieOptionsFor = (token) => {
    const expiresAtSeconds = jwt.decode(token)?.exp;

    return expiresAtSeconds
        ? { ...cookieBase(), expires: new Date(expiresAtSeconds * 1000) }
        : cookieBase();
};

export const setAuthCookies = (res, { accessToken, refreshToken }) => {
    res.cookie("accessToken", accessToken, cookieOptionsFor(accessToken));
    res.cookie("refreshToken", refreshToken, cookieOptionsFor(refreshToken));
};

export const clearAuthCookies = (res) => {
    res.clearCookie("accessToken", cookieBase());
    res.clearCookie("refreshToken", cookieBase());
};

export const wantsJson = (req) =>
    Boolean(req.xhr) ||
    Boolean(req.header("Authorization")) ||
    req.accepts(["html", "json"]) === "json";

export const passwordChangedAfter = (user, issuedAtSeconds) =>
    Boolean(user.passwordChangedAt) &&
    issuedAtSeconds < Math.floor(user.passwordChangedAt.getTime() / 1000);

export const startSession = async (res, user, previousRefreshToken) => {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    await User.addSession(user._id, refreshToken, previousRefreshToken);

    setAuthCookies(res, { accessToken, refreshToken });

    return { accessToken, refreshToken };
};

export const rotateSession = async (res, refreshToken) => {
    let decoded;

    try {
        decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) return null;
        throw error;
    }

    const user = await User.findById(decoded._id);

    if (!user || !user.isActive) return null;
    if (passwordChangedAfter(user, decoded.iat)) return null;
    if (!(await User.hasSession(user._id, refreshToken))) return null;

    const tokens = await startSession(res, user, refreshToken);

    return { user, tokens };
};