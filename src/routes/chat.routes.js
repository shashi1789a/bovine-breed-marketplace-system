import { Router } from "express";
import rateLimit from "express-rate-limit";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    findPeople,
    getConversationMessages,
    getIceServers,
    getMe,
    getMyConversations,
    showChatPage,
    startConversation
} from "../controllers/chat.controller.js";

const router = Router();

const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many searches. Please wait a minute." }
});

router.use(verifyJWT);

router.get("/", showChatPage);

router.get("/api/me", getMe);
router.get("/api/users", searchLimiter, findPeople);
router.get("/api/conversations", getMyConversations);
router.post("/api/conversations", startConversation);
router.get("/api/conversations/:id/messages", getConversationMessages);
router.get("/api/ice-servers", getIceServers);

export default router;
