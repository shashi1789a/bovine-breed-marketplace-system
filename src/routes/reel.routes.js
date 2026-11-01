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
import {
    addComment,
    deleteComment,
    listComments,
    recordView,
    toggleLike
} from "../controllers/reelEngagement.controller.js";
import { userLimiter } from "../utils/limiter.js";

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

router.get("/", optionalAuth, showReelsPage);
router.get("/api", optionalAuth, listReels);

router.get("/new", verifyJWT, canManageCattle, showUploadPage);
router.post("/", verifyJWT, canManageCattle, uploadLimiter, reelUploadHandler, createReel);
router.post("/:id/delete", verifyJWT, deleteReel);

const viewLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many requests." }
});

router.post("/:id/view", optionalAuth, viewLimiter, recordView);
router.post(
    "/:id/like",
    verifyJWT,
    userLimiter({ windowMs: 60 * 1000, limit: 60, message: "Too many likes. Please slow down." }),
    toggleLike
);
router.get("/:id/comments", optionalAuth, listComments);
router.post(
    "/:id/comments",
    verifyJWT,
    userLimiter({ windowMs: 10 * 60 * 1000, limit: 30, message: "You are commenting too fast. Please wait a few minutes." }),
    addComment
);
router.post("/:id/comments/:commentId/delete", verifyJWT, deleteComment);

export default router;
