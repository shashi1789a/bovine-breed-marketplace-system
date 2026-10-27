import { Router } from "express";
import rateLimit from "express-rate-limit";

import { verifyJWT, optionalAuth } from "../middlewares/auth.middleware.js";
import { canManageCattle } from "../middlewares/cattle.middleware.js";
import { reelUploadHandler } from "../middlewares/reelUpload.middleware.js";
import {
    createReel,
    deleteReel,
    listReels,
    showReelsPage,
    showUploadPage
} from "../controllers/reel.controller.js";

const router = Router();

const uploadLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?._id || "anonymous"),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: "Too many uploads. Please wait a few minutes." }
});

/* Watching is open to everyone. */
router.get("/", optionalAuth, showReelsPage);
router.get("/api", optionalAuth, listReels);

/* Uploading and deleting need a login. Only farmers can upload. */
router.get("/new", verifyJWT, canManageCattle, showUploadPage);
router.post("/", verifyJWT, canManageCattle, uploadLimiter, reelUploadHandler, createReel);
router.post("/:id/delete", verifyJWT, deleteReel);

export default router;
