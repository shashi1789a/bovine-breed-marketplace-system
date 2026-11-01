import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    pushKey,
    pushSubscribe,
    pushUnsubscribe,
    savePreferences,
    showPreferences
} from "../controllers/preferences.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.use(verifyJWT);

router.get("/preferences", showPreferences);
router.post(
    "/preferences",
    userLimiter({ windowMs: 10 * 60 * 1000, limit: 30, message: "Too many changes. Please wait a few minutes." }),
    savePreferences
);

router.get("/push/key", pushKey);
router.post(
    "/push/subscribe",
    userLimiter({ windowMs: 10 * 60 * 1000, limit: 20, message: "Too many requests. Please wait." }),
    pushSubscribe
);
router.post("/push/unsubscribe", pushUnsubscribe);

export default router;
