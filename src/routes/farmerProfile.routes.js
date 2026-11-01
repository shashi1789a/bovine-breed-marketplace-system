import { Router } from "express";

import { optionalAuth, verifyJWT } from "../middlewares/auth.middleware.js";
import { showFarmerProfile } from "../controllers/reel.controller.js";
import { createReview, deleteReview } from "../controllers/review.controller.js";
import { followFarmer, unfollowFarmer } from "../controllers/follow.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.post("/reviews/:id/delete", verifyJWT, deleteReview);
router.post(
    "/:username/reviews",
    verifyJWT,
    userLimiter({ windowMs: 60 * 60 * 1000, limit: 15, message: "Too many reviews. Please try again later." }),
    createReview
);
router.post(
    "/:username/follow",
    verifyJWT,
    userLimiter({ windowMs: 10 * 60 * 1000, limit: 40, message: "Too many requests. Please wait a few minutes." }),
    followFarmer
);
router.post("/:username/unfollow", verifyJWT, unfollowFarmer);
router.get("/:username", optionalAuth, showFarmerProfile);

export default router;
