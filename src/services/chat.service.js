import { Conversation, makePairKey } from "../models/conversation.model.js";
import { Message, MAX_MESSAGE_LENGTH } from "../models/message.model.js";
import { User, USER_ROLES } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";

const PUBLIC_USER_FIELDS = "fullName username avatar role";
const ID_PATTERN = /^[a-f\d]{24}$/i;
const MAX_CONVERSATIONS = 50;
const DEFAULT_PAGE = 30;
const MAX_PAGE = 100;

/*
 * Always turn ids into plain strings before they reach a query, so a request
 * like { "$ne": "x" } can never become a Mongo operator.
 */
export const toId = (value) => {
    const id = String(value ?? "");

    if (!ID_PATTERN.test(id)) throw new ApiError(400, "Invalid id");

    return id;
};

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const toPublicUser = (user) =>
    user && {
        id: String(user._id),
        fullName: user.fullName,
        username: user.username,
        avatar: user.avatar,
        role: user.role
    };

export const toPublicMessage = (message) => ({
    id: String(message._id),
    conversationId: String(message.conversation),
    senderId: String(message.sender),
    type: message.type,
    text: message.text ?? "",
    call:
        message.type === "call"
            ? { outcome: message.call?.outcome, durationSec: message.call?.durationSec || 0 }
            : null,
    createdAt: message.createdAt
});

const unreadFor = (conversation, userId) => {
    const unread = conversation.unread;
    const value = unread instanceof Map ? unread.get(userId) : unread?.[userId];

    return Number(value) || 0;
};

export const toPublicConversation = (conversation, userId, other) => ({
    id: String(conversation._id),
    other: toPublicUser(other),
    unread: unreadFor(conversation, userId),
    lastMessage: conversation.lastMessage?.at
        ? {
              text: conversation.lastMessage.text,
              type: conversation.lastMessage.type,
              senderId: String(conversation.lastMessage.sender),
              at: conversation.lastMessage.at
          }
        : null,
    updatedAt: conversation.updatedAt
});

export const otherParticipant = (conversation, userId) =>
    String(conversation.participants.find((id) => String(id) !== String(userId)));

/* Only participants may touch a conversation; everyone else just gets "not found". */
export const getConversationFor = async (conversationId, userId) => {
    const conversation = await Conversation.findOne({
        _id: toId(conversationId),
        participants: toId(userId)
    }).lean();

    if (!conversation) throw new ApiError(404, "Conversation not found");

    return conversation;
};

const assertUsersActive = async (firstId, secondId) => {
    const active = await User.countDocuments({
        _id: { $in: [firstId, secondId] },
        isActive: true
    });

    if (active !== 2) throw new ApiError(403, "This user is not available");
};

export const searchUsers = async ({ userId, q, role }) => {
    if (typeof q !== "string") return [];

    const term = q.trim().slice(0, 50);

    if (term.length < 2) return [];

    const pattern = new RegExp(escapeRegex(term), "i");
    const filter = {
        _id: { $ne: toId(userId) },
        isActive: true,
        $or: [{ fullName: pattern }, { username: pattern }]
    };

    if (typeof role === "string" && USER_ROLES.includes(role)) filter.role = role;

    const users = await User.find(filter)
        .select(PUBLIC_USER_FIELDS)
        .sort({ fullName: 1 })
        .limit(20)
        .lean();

    return users.map(toPublicUser);
};

export const openConversation = async (userId, otherUserId) => {
    const me = toId(userId);
    const otherId = toId(otherUserId);

    if (me === otherId) throw new ApiError(400, "You cannot chat with yourself");

    const other = await User.findOne({ _id: otherId, isActive: true })
        .select(PUBLIC_USER_FIELDS)
        .lean();

    if (!other) throw new ApiError(404, "User not found");

    const pairKey = makePairKey(me, otherId);
    let conversation;

    try {
        conversation = await Conversation.findOneAndUpdate(
            { pairKey },
            { $setOnInsert: { participants: [me, otherId] } },
            { upsert: true, new: true }
        ).lean();
    } catch (error) {
        if (error?.code !== 11000) throw error;

        conversation = await Conversation.findOne({ pairKey }).lean();
    }

    return { conversation, other };
};

export const listConversations = async (userId) => {
    const me = toId(userId);

    const conversations = await Conversation.find({
        participants: me,
        "lastMessage.at": { $exists: true }
    })
        .sort({ updatedAt: -1 })
        .limit(MAX_CONVERSATIONS)
        .populate({ path: "participants", select: `${PUBLIC_USER_FIELDS} isActive` })
        .lean();

    return conversations
        .map((conversation) => {
            const other = conversation.participants.find(
                (participant) => participant && String(participant._id) !== me
            );

            return other ? toPublicConversation(conversation, me, other) : null;
        })
        .filter(Boolean);
};

export const listMessages = async ({ conversationId, userId, before, limit }) => {
    const conversation = await getConversationFor(conversationId, userId);
    const size = Math.min(Math.max(parseInt(limit, 10) || DEFAULT_PAGE, 1), MAX_PAGE);
    const filter = { conversation: conversation._id };

    if (before !== undefined && before !== "") filter._id = { $lt: toId(before) };

    const rows = await Message.find(filter)
        .sort({ _id: -1 })
        .limit(size + 1)
        .lean();

    return {
        messages: rows.slice(0, size).reverse().map(toPublicMessage),
        hasMore: rows.length > size
    };
};

export const sendMessage = async ({ conversationId, senderId, text }) => {
    if (typeof text !== "string") throw new ApiError(400, "Message must be text");

    const body = text.trim();

    if (!body) throw new ApiError(400, "Message cannot be empty");

    if (body.length > MAX_MESSAGE_LENGTH) {
        throw new ApiError(400, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`);
    }

    const sender = toId(senderId);
    const conversation = await getConversationFor(conversationId, sender);
    const recipientId = otherParticipant(conversation, sender);

    await assertUsersActive(sender, recipientId);

    const message = await Message.create({
        conversation: conversation._id,
        sender,
        type: "text",
        text: body
    });

    await Conversation.updateOne(
        { _id: conversation._id },
        {
            $set: {
                lastMessage: { text: body.slice(0, 120), type: "text", sender, at: message.createdAt }
            },
            $inc: { [`unread.${recipientId}`]: 1 }
        }
    );

    return { message: toPublicMessage(message), recipientId };
};

export const markRead = async ({ conversationId, userId }) => {
    const me = toId(userId);
    const conversation = await getConversationFor(conversationId, me);

    await Conversation.updateOne(
        { _id: conversation._id },
        { $set: { [`unread.${me}`]: 0 } },
        { timestamps: false }
    );

    return {
        conversationId: String(conversation._id),
        otherId: otherParticipant(conversation, me)
    };
};

const CALL_LABELS = Object.freeze({
    ended: "Video call",
    missed: "Missed video call",
    declined: "Declined video call"
});

/* Saves "who called, how long, answered or not" as a normal chat entry. */
export const logCall = async ({ conversationId, callerId, outcome, durationSec = 0 }) => {
    const caller = toId(callerId);
    const conversation = await getConversationFor(conversationId, caller);
    const calleeId = otherParticipant(conversation, caller);

    const message = await Message.create({
        conversation: conversation._id,
        sender: caller,
        type: "call",
        call: { outcome, durationSec }
    });

    const update = {
        $set: {
            lastMessage: {
                text: CALL_LABELS[outcome] || "Video call",
                type: "call",
                sender: caller,
                at: message.createdAt
            }
        }
    };

    if (outcome === "missed") update.$inc = { [`unread.${calleeId}`]: 1 };

    await Conversation.updateOne({ _id: conversation._id }, update);

    return { message: toPublicMessage(message), calleeId };
};
