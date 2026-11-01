import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { showNotifications, unreadCount } from "../controllers/notification.controller.js";

const router = Router();

router.use(verifyJWT);

router.get("/", showNotifications);
router.get("/count", unreadCount);

export default router;
