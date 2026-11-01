import { Router } from "express";

import { verifyJWT, isFarmer } from "../middlewares/auth.middleware.js";
import { addMoney, deleteEntry, saveMilk, showDairy } from "../controllers/dairy.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.use(verifyJWT, isFarmer);

const writeLimit = userLimiter({ windowMs: 10 * 60 * 1000, limit: 120, message: "Too many changes. Please wait a few minutes." });

router.get("/", showDairy);
router.post("/milk", writeLimit, saveMilk);
router.post("/money", writeLimit, addMoney);
router.post("/:id/delete", writeLimit, deleteEntry);

export default router;
