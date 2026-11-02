import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
    registerApi,
    loginApi,
    refreshApi,
    logoutApi,
    getMeApi,
    updateMeApi,
    changePasswordApi,
    updateAvatarApi,
    updateCoverApi
} from "../controllers/apiAuth.controller.js";

import { submitContactApi } from "../controllers/apiContact.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

import productRoutes from "./product.routes.js";
import cartRoutes from "./cart.routes.js";
import orderRoutes from "./order.routes.js";
import wishlistRoutes from "./wishlist.routes.js";

const router = Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many attempts. Please try again later." }
});

router.use((req, res, next) => {
    req.headers.accept = "application/json";
    res.set("Cache-Control", "no-store");
    next();
});

router.post(
    "/auth/register",
    authLimiter,
    upload.fields([
        { name: "avatar", maxCount: 1 },
        { name: "coverImage", maxCount: 1 }
    ]),
    registerApi
);
router.post("/auth/login", authLimiter, loginApi);
router.post("/auth/refresh", authLimiter, refreshApi);
router.post("/auth/logout", verifyJWT, logoutApi);
router.post("/auth/change-password", verifyJWT, authLimiter, changePasswordApi);
router.post("/auth/avatar", verifyJWT, upload.single("avatar"), updateAvatarApi);
router.post("/auth/cover", verifyJWT, upload.single("coverImage"), updateCoverApi);

router.post(
    "/contact",
    rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 10,
        standardHeaders: true,
        legacyHeaders: false,
        message: { success: false, message: "Too many messages. Please try again later." }
    }),
    submitContactApi
);

router.get("/me", verifyJWT, getMeApi);
router.patch("/me", verifyJWT, updateMeApi);

router.use("/products", productRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);
router.use("/wishlist", wishlistRoutes);

router.use((req, res) => {
    res.status(404).json({ success: false, message: "API route not found" });
});

export default router;
