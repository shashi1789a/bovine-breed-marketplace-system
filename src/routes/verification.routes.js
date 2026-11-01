import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { canManageCattle } from "../middlewares/cattle.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { showVerificationForm, submitVerification } from "../controllers/verification.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.use(verifyJWT, canManageCattle);

router.get("/", showVerificationForm);
router.post(
    "/",
    userLimiter({ windowMs: 60 * 60 * 1000, limit: 5, message: "Too many attempts. Please try again later." }),
    upload.single("farmPhoto"),
    submitVerification
);

export default router;
