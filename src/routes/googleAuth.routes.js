import { Router } from "express";
import {
    startGoogleAuth,
    handleGoogleCallback
} from "../controllers/googleAuth.controller.js";

const router = Router();

router.get("/google", startGoogleAuth);
router.get("/google/callback", handleGoogleCallback);

export default router;