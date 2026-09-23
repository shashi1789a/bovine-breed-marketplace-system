import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import { User, SELF_REGISTER_ROLES, EMAIL_PATTERN } from "../models/user.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { discardUploads } from "../utils/uploads.js";
import {
    LOGIN_PATH,
    startSession,
    rotateSession,
    clearAuthCookies,
    wantsJson
} from "../utils/session.js";

const DEFAULT_LANDING = "/dashboard";
const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const MAX_LOGIN_PASSWORD_LENGTH = 128;
const MAX_FLASH_LENGTH = 200;

const DUMMY_HASH = bcrypt.hashSync("timing-equalizer-password", 12);

const readText = (value) => (typeof value === "string" ? value.trim() : "");

const readFlash = (value) => {
    const text = readText(value);
    return text ? text.slice(0, MAX_FLASH_LENGTH) : null;
};

const safeRedirect = (target, fallback) =>
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\") &&
    !/[\r\n]/.test(target)
        ? target
        : fallback;

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

const validationMessage = (error) =>
    Object.values(error.errors)
        .map((item) => item.message)
        .join(" ");

const renderPage = (view) => (req, res) =>
    res.render(view, {
        user: req.user,
        error: null,
        success: readFlash(req.query.success)
    });

const showRegisterPage = (req, res) =>
    res.render("auth/register", { error: null, formData: {} });

const showLoginPage = (req, res) => {
    const next = safeRedirect(req.query.next, "");

    return res.render("auth/login", {
        error: null,
        success: readFlash(req.query.success),
        next
    });
};

const registerUser = asyncHandler(async (req, res) => {
    const formData = {
        fullName: readText(req.body?.fullName),
        email: readText(req.body?.email).toLowerCase(),
        username: readText(req.body?.username).toLowerCase(),
        role: readText(req.body?.role).toLowerCase()
    };

    const password = typeof req.body?.password === "string" ? req.body.password : "";

    const reject = (status, error) =>
        res.status(status).render("auth/register", { error, formData });

    try {
        if (
            !formData.fullName ||
            !formData.email ||
            !formData.username ||
            !formData.role ||
            !password
        ) {
            return reject(400, "All fields are required.");
        }

        if (formData.fullName.length < 2 || formData.fullName.length > 100) {
            return reject(400, "Full name must be 2-100 characters long.");
        }

        if (!EMAIL_PATTERN.test(formData.email) || formData.email.length > 254) {
            return reject(400, "Enter a valid email address.");
        }

        if (!USERNAME_PATTERN.test(formData.username)) {
            return reject(
                400,
                "Username must be 3-30 characters: letters, numbers, dot or underscore."
            );
        }

        const problem = passwordProblem(password);

        if (problem) return reject(400, problem);

        if (!SELF_REGISTER_ROLES.includes(formData.role)) {
            return reject(400, "Invalid role.");
        }

        const avatarFile = req.files?.avatar?.[0];
        const coverFile = req.files?.coverImage?.[0];

        if (!avatarFile) return reject(400, "Avatar is required.");

        if (!isImage(avatarFile) || (coverFile && !isImage(coverFile))) {
            return reject(400, "Only image files are allowed.");
        }

        const existing = await User.exists({
            $or: [{ email: formData.email }, { username: formData.username }]
        });

        if (existing) {
            return reject(409, "Username or Email already exists.");
        }

        const [avatarUrl, coverUrl] = await Promise.all([
            uploadImage(avatarFile),
            coverFile ? uploadImage(coverFile) : Promise.resolve("")
        ]);

        if (!avatarUrl || (coverFile && !coverUrl)) {
            return reject(502, "Image upload failed. Please try again.");
        }

        await User.create({
            ...formData,
            password,
            avatar: avatarUrl,
            coverImage: coverUrl
        });

        return res.redirect(
            `${LOGIN_PATH}?success=${encodeURIComponent("Registration successful. Please login.")}`
        );
    } catch (error) {
        if (error?.code === 11000) {
            return reject(409, "Username or Email already exists.");
        }

        if (error?.name === "ValidationError") {
            return reject(400, validationMessage(error));
        }

        throw error;
    } finally {
        await discardUploads(req);
    }
});

const loginUser = asyncHandler(async (req, res) => {
    const identifier = readText(req.body?.email).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const next = safeRedirect(req.body?.next ?? req.query.next, "");

    const reject = (status, error) =>
        res.status(status).render("auth/login", { error, success: null, next });

    if (!identifier || !password) {
        return reject(400, "Email and password are required.");
    }

    if (password.length > MAX_LOGIN_PASSWORD_LENGTH) {
        return reject(401, "Invalid credentials.");
    }

    const user = await User.findOne({
        $or: [{ email: identifier }, { username: identifier }]
    }).select("+password");

    const valid = user
        ? await user.isPasswordCorrect(password)
        : await bcrypt.compare(password, DUMMY_HASH).then(() => false);

    if (!user || !valid) {
        return reject(401, "Invalid credentials.");
    }

    if (!user.isActive) {
        return reject(403, "Your account has been disabled. Please contact support.");
    }

    await startSession(res, user);

    await User.updateOne(
        { _id: user._id },
        { $set: { lastLoginAt: new Date() } },
        { timestamps: false }
    );

    return res.redirect(next || DEFAULT_LANDING);
});

const logoutUser = asyncHandler(async (req, res) => {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
        try {
            const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
            await User.removeSession(decoded._id, refreshToken);
        } catch (error) {
            if (!(error instanceof jwt.JsonWebTokenError)) throw error;
        }
    }

    clearAuthCookies(res);

    return res.redirect(LOGIN_PATH);
});

const refreshAccessToken = asyncHandler(async (req, res) => {
    const cookieToken = req.cookies?.refreshToken;
    const bodyToken =
        typeof req.body?.refreshToken === "string" ? req.body.refreshToken : null;

    const incoming = cookieToken || bodyToken;
    const session = incoming ? await rotateSession(res, incoming) : null;

    if (!session) {
        clearAuthCookies(res);

        if (wantsJson(req)) {
            return res
                .status(401)
                .json({ success: false, message: "Invalid or expired refresh token." });
        }

        return res.redirect(LOGIN_PATH);
    }

    if (wantsJson(req)) {
        const data = cookieToken ? {} : session.tokens;

        return res
            .status(200)
            .json(new ApiResponse(200, data, "Session refreshed successfully"));
    }

    return res.redirect(DEFAULT_LANDING);
});

const changeCurrentPassword = asyncHandler(async (req, res) => {
    const oldPassword = typeof req.body?.oldPassword === "string" ? req.body.oldPassword : "";
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const confirmPassword = req.body?.confirmPassword;

    const reject = (status, error) =>
        res.status(status).render("auth/change-password", {
            error,
            success: null,
            user: req.user
        });

    if (!oldPassword || !newPassword) {
        return reject(400, "Old password and new password are required.");
    }

    if (confirmPassword !== undefined && confirmPassword !== newPassword) {
        return reject(400, "New password and confirm password do not match.");
    }

    const problem = passwordProblem(newPassword);

    if (problem) return reject(400, problem);

    if (oldPassword === newPassword) {
        return reject(400, "New password must be different from the old password.");
    }

    const user = await User.findById(req.user._id).select("+password");

    if (!user || !(await user.isPasswordCorrect(oldPassword))) {
        return reject(400, "Old password is incorrect.");
    }

    user.password = newPassword;
    user.passwordChangedAt = new Date();

    await user.save();
    await User.removeAllSessions(user._id);
    await startSession(res, user);

    return res.status(200).render("dashboard/profile", {
        user: req.user,
        success: "Password changed successfully.",
        error: null
    });
});

const updateAccountDetails = asyncHandler(async (req, res) => {
    const fullName = readText(req.body?.fullName);
    const email = readText(req.body?.email).toLowerCase();

    const show = (status, error, success, user = req.user) =>
        res.status(status).render("auth/update-account", { user, error, success });

    if (!fullName || !email) {
        return show(400, "Full Name and Email are required.", null);
    }

    if (fullName.length < 2 || fullName.length > 100) {
        return show(400, "Full name must be 2-100 characters long.", null);
    }

    if (!EMAIL_PATTERN.test(email) || email.length > 254) {
        return show(400, "Enter a valid email address.", null);
    }

    try {
        const duplicate = await User.exists({
            email,
            _id: { $ne: req.user._id }
        });

        if (duplicate) {
            return show(409, "Email already exists.", null);
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            { $set: { fullName, email } },
            { new: true, runValidators: true }
        );

        return show(200, null, "Account updated successfully.", updatedUser);
    } catch (error) {
        if (error?.code === 11000) return show(409, "Email already exists.", null);
        if (error?.name === "ValidationError") return show(400, validationMessage(error), null);
        throw error;
    }
});

const createImageUpdater = ({ field, view, missingMessage, successMessage }) =>
    asyncHandler(async (req, res) => {
        const show = (status, error, success, user = req.user) =>
            res.status(status).render(view, { user, error, success });

        try {
            if (!req.file) return show(400, missingMessage, null);

            if (!isImage(req.file)) {
                return show(400, "Only image files are allowed.", null);
            }

            const url = await uploadImage(req.file);

            if (!url) {
                return show(502, "Failed to upload image. Please try again.", null);
            }

            const updatedUser = await User.findByIdAndUpdate(
                req.user._id,
                { $set: { [field]: url } },
                { new: true, runValidators: true }
            );

            return show(200, null, successMessage, updatedUser);
        } finally {
            await discardUploads(req);
        }
    });

const updateUserAvatar = createImageUpdater({
    field: "avatar",
    view: "auth/update-avatar",
    missingMessage: "Please select an avatar image.",
    successMessage: "Avatar updated successfully."
});

const updateUserCoverImage = createImageUpdater({
    field: "coverImage",
    view: "auth/update-cover",
    missingMessage: "Please select a cover image.",
    successMessage: "Cover image updated successfully."
});

const showProfilePage = renderPage("dashboard/profile");
const showChangePasswordPage = renderPage("auth/change-password");
const showUpdateAccountPage = renderPage("auth/update-account");
const showUpdateAvatarPage = renderPage("auth/update-avatar");
const showUpdateCoverPage = renderPage("auth/update-cover");

export {
    showRegisterPage,
    showLoginPage,
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    showProfilePage,
    showChangePasswordPage,
    changeCurrentPassword,
    showUpdateAccountPage,
    updateAccountDetails,
    showUpdateAvatarPage,
    updateUserAvatar,
    showUpdateCoverPage,
    updateUserCoverImage
};