import { Router } from "express";

import { verifyJWT, isFarmer } from "../middlewares/auth.middleware.js";
import {
    completeReminder,
    createBreeding,
    createReminder,
    deleteReminder,
    showReminders
} from "../controllers/reminder.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.use(verifyJWT, isFarmer);

const writeLimit = userLimiter({ windowMs: 10 * 60 * 1000, limit: 90, message: "Too many changes. Please wait a few minutes." });

router.get("/", showReminders);
router.post("/", writeLimit, createReminder);
router.post("/breeding", writeLimit, createBreeding);
router.post("/:id/done", writeLimit, completeReminder);
router.post("/:id/delete", writeLimit, deleteReminder);

export default router;
