import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { buildIceServers } from "../sockets/socket.helpers.js";
import {
    listConversations,
    listMessages,
    openConversation,
    searchUsers,
    toPublicConversation,
    toPublicUser
} from "../services/chat.service.js";

export const showChatPage = (req, res) =>
    res.status(200).render("chat/index", {
        title: "Messages | BoviNetra",
        user: req.user
    });

/* Also used by the browser to refresh an expired session before reconnecting the socket. */
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
