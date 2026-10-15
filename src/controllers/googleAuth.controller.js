import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";

import { User, SELF_REGISTER_ROLES } from "../models/user.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { safeRedirect } from "../utils/http.js";
import { startSession } from "../utils/session.js";

const COOKIE_NAME = "bn_google_oauth";
const COOKIE_PATH = "/auth/google";
const COOKIE_MAX_AGE_MS = 10 * 60 * 1000;
const SCOPES = ["openid", "email", "profile"];
const DEFAULT_ROLE = "user";
const DEFAULT_LANDING = "/dashboard";
const DEFAULT_AVATAR = "/images/default-avatar.png";
const USERNAME_ATTEMPTS = 6;

export const isGoogleConfigured = () =>
    Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const callbackUrl = () =>
    process.env.GOOGLE_CALLBACK_URL ||
    `http://localhost:${process.env.PORT || 8000}/auth/google/callback`;

const createClient = () =>
    new OAuth2Client({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: callbackUrl()
    });

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: COOKIE_PATH
});

const renderLogin = (res, status, error) =>
    res.status(status).render("auth/login", {
        error,
        success: null,
        next: "",
        identifier: "",
        googleEnabled: isGoogleConfigured()
    });

const readPending = (req) => {
    try {
        const parsed = JSON.parse(req.cookies?.[COOKIE_NAME] || "");

        return typeof parsed?.state === "string" ? parsed : null;
    } catch {
        return null;
    }
};

const sameText = (first, second) => {
    const left = Buffer.from(String(first));
    const right = Buffer.from(String(second));

    return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const fetchGoogleProfile = async (code) => {
    const client = createClient();

    const { tokens } = await client.getToken(code);

    const ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();

    return {
        id: payload.sub,
        email: String(payload.email || "").toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: String(payload.name || "").trim(),
        picture: payload.picture || ""
    };
};

const usernameBase = (email) => {
    const cleaned = email
        .split("@")[0]
        .replace(/[^a-z0-9_.]/g, "")
        .slice(0, 22);

    return cleaned.length >= 3 ? cleaned : `${cleaned}user`;
};

const uniqueUsername = async (email) => {
    const base = usernameBase(email);

    for (let attempt = 0; attempt < USERNAME_ATTEMPTS; attempt++) {
        const candidate = attempt === 0 ? base : `${base}${crypto.randomInt(100, 10000)}`;

        if (!(await User.exists({ username: candidate }))) return candidate;
    }

    return `${base}${crypto.randomBytes(3).toString("hex")}`;
};

const createGoogleUser = async (profile, role) => {
    const fullName = (profile.name || profile.email.split("@")[0]).slice(0, 100);

    return User.create({
        fullName: fullName.length >= 2 ? fullName : `${fullName} user`,
        email: profile.email,
        username: await uniqueUsername(profile.email),
        avatar: profile.picture || DEFAULT_AVATAR,
        role,
        googleId: profile.id
    });
};

export const startGoogleAuth = (req, res) => {
    if (!isGoogleConfigured()) {
        return renderLogin(res, 503, "Google sign-in is not set up yet.");
    }

    const requestedRole = String(req.query.role || "").toLowerCase();

    const pending = {
        state: crypto.randomBytes(24).toString("hex"),
        role: SELF_REGISTER_ROLES.includes(requestedRole) ? requestedRole : DEFAULT_ROLE,
        next: safeRedirect(req.query.next, "")
    };

    res.cookie(COOKIE_NAME, JSON.stringify(pending), {
        ...cookieOptions(),
        maxAge: COOKIE_MAX_AGE_MS
    });

    const url = createClient().generateAuthUrl({
        scope: SCOPES,
        state: pending.state,
        prompt: "select_account"
    });

    return res.redirect(url);
};

export const handleGoogleCallback = asyncHandler(async (req, res) => {
    if (!isGoogleConfigured()) {
        return renderLogin(res, 503, "Google sign-in is not set up yet.");
    }

    const pending = readPending(req);

    res.clearCookie(COOKIE_NAME, cookieOptions());

    if (req.query.error) {
        return renderLogin(res, 400, "Google sign-in was cancelled.");
    }

    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";

    if (!pending || !code || !sameText(state, pending.state)) {
        return renderLogin(res, 400, "Your Google sign-in session expired. Please try again.");
    }

    let profile;

    try {
        profile = await fetchGoogleProfile(code);
    } catch (error) {
        console.error("[google] could not verify the sign-in:", error.message);

        return renderLogin(res, 502, "We could not verify your Google account. Please try again.");
    }

    if (!profile.email || !profile.emailVerified) {
        return renderLogin(res, 403, "Your Google email address is not verified.");
    }

    let user = await User.findOne({ googleId: profile.id });

    if (!user) {
        if (await User.exists({ email: profile.email })) {
            return renderLogin(
                res,
                409,
                "An account with this email already exists. Sign in with your password instead."
            );
        }

        const role = SELF_REGISTER_ROLES.includes(pending.role) ? pending.role : DEFAULT_ROLE;

        try {
            user = await createGoogleUser(profile, role);
        } catch (error) {
            if (error?.code === 11000 || error?.name === "ValidationError") {
                console.error("[google] could not create the account:", error.message);

                return renderLogin(res, 409, "We could not create your account. Please try again.");
            }

            throw error;
        }
    }

    if (!user.isActive) {
        return renderLogin(res, 403, "Your account has been disabled. Please contact support.");
    }

    await startSession(res, user);

    await User.updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: new Date() } },
        { timestamps: false }
    );

    return res.redirect(safeRedirect(pending.next, DEFAULT_LANDING));
});