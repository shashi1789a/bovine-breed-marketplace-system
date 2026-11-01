import { Router } from "express";
import rateLimit from "express-rate-limit";

import { optionalAuth, verifyJWT } from "../middlewares/auth.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
    showDetectPage,
    predictBreed,
    showResultPage,
    getPredictionHistory,
    suggestBreed
} from "../controllers/breed.controller.js";

const router = Router();

const renderDetectError = (req, res, status, error) =>
    res.status(status).render("breed/detect", {
        title: "AI Cow Breed Detector",
        user: req.user,
        error
    });

const predictLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) =>
        renderDetectError(req, res, 429, "Too many requests. Please wait a minute and try again.")
});

const uploadImage = (req, res, next) => {
    upload.single("image")(req, res, (error) => {
        if (!error) return next();

        const message =
            error.code === "LIMIT_FILE_SIZE"
                ? "Image must be 5 MB or smaller."
                : error.message || "Invalid upload.";

        return renderDetectError(req, res, 400, message);
    });
};

const suggestLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?._id || "anonymous"),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: "Too many breed checks. Please wait a few minutes." }
});

const suggestUpload = (req, res, next) => {
    upload.single("image")(req, res, (error) => {
        if (!error) return next();

        const message = error.code === "LIMIT_FILE_SIZE" ? "Image must be 5 MB or smaller." : error.message || "Invalid upload.";

        return res.status(400).json({ success: false, message });
    });
};

router.post("/suggest", verifyJWT, suggestLimiter, suggestUpload, suggestBreed);
router.get("/detect", optionalAuth, showDetectPage);
router.post("/predict", optionalAuth, predictLimiter, uploadImage, predictBreed);
router.get("/result/:id", optionalAuth, showResultPage);
router.get("/history", verifyJWT, getPredictionHistory);

export default router;