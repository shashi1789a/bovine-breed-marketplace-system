import { Router } from "express";

import { optionalAuth } from "../middlewares/auth.middleware.js";
import rateLimit from "express-rate-limit";
import { getAllCattle, getCattleById, getCattleMapData, showCattleMap } from "../controllers/cattle.controller.js";

const router = Router();

router.use(optionalAuth);

const mapLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many map requests. Please wait a minute." }
});

router.get("/", getAllCattle);
router.get("/map", showCattleMap);
router.get("/map/data", mapLimiter, getCattleMapData);
router.get("/:id", getCattleById);

export default router;
