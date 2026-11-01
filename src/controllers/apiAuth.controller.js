import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { User, SELF_REGISTER_ROLES, EMAIL_PATTERN } from "../models/user.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { discardUploads } from "../utils/uploads.js";
import { passwordChangedAfter } from "../utils/session.js";

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const MAX_LOGIN_PASSWORD_LENGTH = 128;
const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-password", 12);

const readText = (value) => (typeof value === "string" ? value.trim() : "");

const passwordProblem = (password) => {
    if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        return `Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters long.`;
    }

    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        return "Password must contain at least one letter and one number.";
    }

    return null;
};

const isImage = (file) => Boolean(file?.mimetype?.startsWith("image/"));

const uploadImage = async (file) => {
    const uploaded = await uploadOnCloudinary(file.path);
    return uploaded?.secure_url || uploaded?.url || "";
};

const issueTokens = async (user, previousRefreshToken) => {
    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    await User.addSession(user._id, refreshToken, previousRefreshToken);

    return { accessToken, refreshToken };
};

const authPayload = (user, tokens) => ({ user: user.toJSON(), ...tokens });

const registerApi = asyncHandler(async (req, res) => {
    const fullName = readText(req.body?.fullName);
    const email = readText(req.body?.email).toLowerCase();
    const username = readText(req.body?.username).toLowerCase();
    const role = readText(req.body?.role).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    try {
        if (!fullName || !email || !username || !role || !password) {
            throw new ApiError(400, "All fields are required.");
        }

        if (fullName.length < 2 || fullName.length > 100) {
            throw new ApiError(400, "Full name must be 2-100 characters long.");
        }

        if (!EMAIL_PATTERN.test(email) || email.length > 254) {
            throw new ApiError(400, "Enter a valid email address.");
        }

        if (!USERNAME_PATTERN.test(username)) {
            throw new ApiError(
                400,
                "Username must be 3-30 characters: letters, numbers, dot or underscore."
            );
        }

        const problem = passwordProblem(password);

        if (problem) throw new ApiError(400, problem);

        if (!SELF_REGISTER_ROLES.includes(role)) {
            throw new ApiError(400, "Invalid role.");
        }

        const avatarFile = req.files?.avatar?.[0];
        const coverFile = req.files?.coverImage?.[0];

        if (!avatarFile) throw new ApiError(400, "Avatar is required.");

        if (!isImage(avatarFile) || (coverFile && !isImage(coverFile))) {
            throw new ApiError(400, "Only image files are allowed.");
        }

        const existing = await User.exists({ $or: [{ email }, { username }] });

        if (existing) throw new ApiError(409, "Username or Email already exists.");

        const [avatarUrl, coverUrl] = await Promise.all([
            uploadImage(avatarFile),
            coverFile ? uploadImage(coverFile) : Promise.resolve("")
        ]);

        if (!avatarUrl || (coverFile && !coverUrl)) {
            throw new ApiError(502, "Image upload failed. Please try again.");
        }

        const user = await User.create({
            fullName,
            email,
            username,
            role,
            password,
            avatar: avatarUrl,
            coverImage: coverUrl
        });

        const tokens = await issueTokens(user);

        return res
            .status(201)
            .json(new ApiResponse(201, authPayload(user, tokens), "Registration successful"));
    } catch (error) {
        if (error?.code === 11000) {
            throw new ApiError(409, "Username or Email already exists.");
        }

        if (error?.name === "ValidationError") {
            throw new ApiError(
                400,
                Object.values(error.errors)
                    .map((item) => item.message)
                    .join(" ")
            );
        }

        throw error;
    } finally {
        await discardUploads(req);
    }
});

const loginApi = asyncHandler(async (req, res) => {
    const identifier = readText(req.body?.email ?? req.body?.identifier).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";

    if (!identifier || !password) {
        throw new ApiError(400, "Email and password are required.");
    }

    if (password.length > MAX_LOGIN_PASSWORD_LENGTH) {
        throw new ApiError(401, "Invalid credentials.");
    }

    const user = await User.findOne({
        $or: [{ email: identifier }, { username: identifier }]
    }).select("+password");

    const valid = user
        ? await user.isPasswordCorrect(password)
        : await bcrypt.compare(password, DUMMY_HASH).then(() => false);

    if (!user || !valid) throw new ApiError(401, "Invalid credentials.");

    if (!user.isActive) {
        throw new ApiError(403, "Your account has been disabled. Please contact support.");
    }

    const tokens = await issueTokens(user);

    await User.updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: new Date() } },
        { timestamps: false }
    );

    return res
        .status(200)
        .json(new ApiResponse(200, authPayload(user, tokens), "Login successful"));
});

const refreshApi = asyncHandler(async (req, res) => {
    const incoming = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";

    if (!incoming) throw new ApiError(401, "Refresh token is required.");

    let decoded;

    try {
        decoded = jwt.verify(incoming, process.env.REFRESH_TOKEN_SECRET);
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            throw new ApiError(401, "Invalid or expired refresh token.");
        }

        throw error;
    }

    const user = await User.findById(decoded._id);

    if (
        !user ||
        !user.isActive ||
        passwordChangedAfter(user, decoded.iat) ||
        !(await User.hasSession(user._id, incoming))
    ) {
        throw new ApiError(401, "Invalid or expired refresh token.");
    }

    const tokens = await issueTokens(user, incoming);

    return res.status(200).json(new ApiResponse(200, tokens, "Session refreshed successfully"));
});

const logoutApi = asyncHandler(async (req, res) => {
    const incoming = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";

    if (incoming) {
        try {
            const decoded = jwt.verify(incoming, process.env.REFRESH_TOKEN_SECRET);

            if (String(decoded._id) === String(req.user._id)) {
                await User.removeSession(decoded._id, incoming);
            }
        } catch (error) {
            if (!(error instanceof jwt.JsonWebTokenError)) throw error;
        }
    }

    return res.status(200).json(new ApiResponse(200, {}, "Logged out"));
});

const getMeApi = asyncHandler(async (req, res) =>
    res.status(200).json(new ApiResponse(200, req.user.toJSON(), "Profile fetched"))
);

const updateMeApi = asyncHandler(async (req, res) => {
    const fullName = readText(req.body?.fullName);
    const email = readText(req.body?.email).toLowerCase();

    if (!fullName && !email) {
        throw new ApiError(400, "Provide a full name or an email to update.");
    }

    if (fullName && (fullName.length < 2 || fullName.length > 100)) {
        throw new ApiError(400, "Full name must be 2-100 characters long.");
    }

    if (email && (!EMAIL_PATTERN.test(email) || email.length > 254)) {
        throw new ApiError(400, "Enter a valid email address.");
    }

    if (email && email !== req.user.email) {
        const taken = await User.exists({ email, _id: { $ne: req.user._id } });

        if (taken) throw new ApiError(409, "Email already in use.");
    }

    const user = await User.findById(req.user._id);

    if (fullName) user.fullName = fullName;
    if (email) user.email = email;

    await user.save();

    return res.status(200).json(new ApiResponse(200, user.toJSON(), "Profile updated"));
});

const changePasswordApi = asyncHandler(async (req, res) => {
    const oldPassword = typeof req.body?.oldPassword === "string" ? req.body.oldPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";

    if (!oldPassword || !newPassword) {
        throw new ApiError(400, "Old password and new password are required.");
    }

    const problem = passwordProblem(newPassword);

    if (problem) throw new ApiError(400, problem);

    if (oldPassword === newPassword) {
        throw new ApiError(400, "New password must be different from the old password.");
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user || !(await user.isPasswordCorrect(oldPassword))) {
        throw new ApiError(400, "Old password is incorrect.");
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();

    await user.save();
    await User.removeAllSessions(user._id);

    const tokens = await issueTokens(user);

    return res
        .status(200)
        .json(new ApiResponse(200, authPayload(user, tokens), "Password changed successfully"));
});

export { registerApi, loginApi, refreshApi, logoutApi, getMeApi, updateMeApi, changePasswordApi };
