import { Router } from "express";

import { optionalAuth } from "../middlewares/auth.middleware.js";
import { showFarmerProfile } from "../controllers/reel.controller.js";

const router = Router();

router.get("/:username", optionalAuth, showFarmerProfile);

export default router;
