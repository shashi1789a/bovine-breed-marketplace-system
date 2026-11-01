import { notifyNewMessage } from "../services/chatNotify.service.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { discardUploads } from "../utils/uploads.js";
import {
    CHAT_FILE_TYPES,
    cleanFileName,
    contentMatchesType,
    readFileHead
} from "../middlewares/chatUpload.middleware.js";
import { buildIceServers } from "../sockets/socket.helpers.js";
import {
    getConversationFor,
    listConversations,
    listMessages,
    openConversation,
    searchUsers,
    sendAttachment,
    toPublicConversation,
    toPublicUser
} from "../services/chat.service.js";

export const showChatPage = (req, res) =>
    res.status(200).render("chat/index", {
        title: "Messages | BoviNetra",
        user: req.user
    });

export const getMe = (req, res) =>
    res.status(200).json(new ApiResponse(200, toPublicUser(req.user), "Session is valid"));

export const findPeople = asyncHandler(async (req, res) => {
    const users = await searchUsers({
        userId: req.user._id,
        q: req.query.q,
        role: req.query.role
    });

    return res.status(200).json(new ApiResponse(200, users, "Users fetched successfully"));
});

export const getMyConversations = asyncHandler(async (req, res) => {
    const conversations = await listConversations(req.user._id);
    const io = req.app.get("io");

    for (const conversation of conversations) {
        if (conversation.other.presenceHidden) continue;

        conversation.other.online = Boolean(io?.sockets.adapter.rooms.get(`user:${conversation.other.id}`)?.size);
    }

    return res
        .status(200)
        .json(new ApiResponse(200, conversations, "Conversations fetched successfully"));
});

export const startConversation = asyncHandler(async (req, res) => {
    const { conversation, other } = await openConversation(req.user._id, req.body?.userId);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                toPublicConversation(conversation, String(req.user._id), other),
                "Conversation ready"
            )
        );
});

export const getConversationMessages = asyncHandler(async (req, res) => {
    const data = await listMessages({
        conversationId: req.params.id,
        userId: req.user._id,
        before: req.query.before,
        limit: req.query.limit
    });

    return res.status(200).json(new ApiResponse(200, data, "Messages fetched successfully"));
});

export const getIceServers = (req, res) => {
    res.set("Cache-Control", "no-store");

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { iceServers: buildIceServers({ userId: String(req.user._id) }) },
                "ICE servers fetched successfully"
            )
        );
};

export const uploadAttachment = asyncHandler(async (req, res) => {
    try {
        const file = req.file;

        if (!file) throw new ApiError(400, "Choose a file to send");

        await getConversationFor(req.params.id, req.user._id);

        if (
            !process.env.CLOUDINARY_CLOUD_NAME ||
            !process.env.CLOUDINARY_API_KEY ||
            !process.env.CLOUDINARY_API_SECRET
        ) {
            console.error("[chat] file sharing is off: CLOUDINARY_* environment variables are missing");
            throw new ApiError(503, "File sharing is not set up on the server yet");
        }

        const head = await readFileHead(file.path);

        if (!contentMatchesType(file.mimetype, head)) {
            throw new ApiError(400, "That file does not look like a valid " + file.mimetype.split("/")[1] + " file");
        }

        const isImage = CHAT_FILE_TYPES[file.mimetype][1];
        const name = cleanFileName(file.originalname, file.mimetype);

        const uploaded = await uploadOnCloudinary(file.path, {
            folder: "bovinetra/chat",
            resource_type: isImage ? "image" : "raw",
            use_filename: true,
            unique_filename: true
        });

        const url = uploaded?.secure_url || uploaded?.url;

        if (!url) throw new ApiError(502, "Could not upload the file. Please try again.");

        const { message, recipientId } = await sendAttachment({
            conversationId: req.params.id,
            senderId: req.user._id,
            caption: req.body?.caption,
            replyToId: req.body?.replyToId,
            attachment: {
                url,
                name,
                mimeType: file.mimetype,
                size: file.size,
                kind: isImage ? "image" : "file"
            }
        });

        const clientId = typeof req.body?.clientId === "string" ? req.body.clientId.slice(0, 64) : undefined;
        const payload = { ...message, clientId };

        const io = req.app.get("io");

        if (io) {
            io.to(`user:${recipientId}`).to(`user:${req.user._id}`).emit("chat:message", payload);

            if (!io.sockets.adapter.rooms.get(`user:${recipientId}`)?.size) {
                notifyNewMessage({
                    recipientId,
                    sender: { id: String(req.user._id), fullName: req.user.fullName },
                    message: payload
                }).catch(() => {});
            }
        }

        return res.status(201).json(new ApiResponse(201, payload, "File sent"));
    } finally {
        await discardUploads(req);
    }
});
