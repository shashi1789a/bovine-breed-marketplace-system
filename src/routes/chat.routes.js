import { Router } from "express";
import rateLimit from "express-rate-limit";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { chatUploadHandler } from "../middlewares/chatUpload.middleware.js";
import {
    findPeople,
    getConversationMessages,
    getIceServers,
    getMe,
    getMyConversations,
    showChatPage,
    startConversation,
    uploadAttachment
} from "../controllers/chat.controller.js";

const router = Router();

const searchLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many searches. Please wait a minute." }
});

const uploadLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => String(req.user?._id || "anonymous"),
    validate: { keyGeneratorIpFallback: false },
    message: { success: false, message: "You are sending files too fast. Please wait a few minutes." }
});

router.use(verifyJWT);

router.get("/", showChatPage);

router.get("/api/me", getMe);
router.get("/api/users", searchLimiter, findPeople);
router.get("/api/conversations", getMyConversations);
router.post("/api/conversations", startConversation);
router.get("/api/conversations/:id/messages", getConversationMessages);
router.post("/api/conversations/:id/attachments", uploadLimiter, chatUploadHandler, uploadAttachment);
router.get("/api/ice-servers", getIceServers);

export default router;
