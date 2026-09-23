import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
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
} from "../controllers/user.controller.js";

import { upload } from "../middlewares/multer.middleware.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: "Too many attempts. Please try again later."
});

router
    .route("/register")
    .get(showRegisterPage)
    .post(
        authLimiter,
        upload.fields([
            { name: "avatar", maxCount: 1 },
            { name: "coverImage", maxCount: 1 }
        ]),
        registerUser
    );

router
    .route("/login")
    .get(showLoginPage)
    .post(authLimiter, loginUser);

router.get("/logout", logoutUser);

router.post("/refresh-token", authLimiter, refreshAccessToken);

router.get("/profile", verifyJWT, showProfilePage);

router
    .route("/change-password")
    .get(verifyJWT, showChangePasswordPage)
    .post(verifyJWT, changeCurrentPassword);

router
    .route("/update-account")
    .get(verifyJWT, showUpdateAccountPage)
    .post(verifyJWT, updateAccountDetails);

router
    .route("/avatar")
    .get(verifyJWT, showUpdateAvatarPage)
    .post(verifyJWT, upload.single("avatar"), updateUserAvatar);

router
    .route("/cover-image")
    .get(verifyJWT, showUpdateCoverPage)
    .post(verifyJWT, upload.single("coverImage"), updateUserCoverImage);

export default router;