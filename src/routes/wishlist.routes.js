import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { showWishlist, toggleWishlist, toggleProductWishlist } from "../controllers/wishlist.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.use(verifyJWT);

router.get("/", showWishlist);
router.post(
    "/toggle",
    userLimiter({ windowMs: 60 * 1000, limit: 60, message: "Too many requests. Please slow down." }),
    toggleWishlist
);

router.post(
    "/product",
    userLimiter({ windowMs: 60 * 1000, limit: 60, message: "Too many requests. Please slow down." }),
    toggleProductWishlist
);

export default router;
