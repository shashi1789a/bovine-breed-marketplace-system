import { Server } from "socket.io";

import { ApiError } from "../utils/ApiError.js";
import {
    forwardMessage,
    getConversationFor,
    logCall,
    markRead,
    otherParticipant,
    sendMessage
} from "../services/chat.service.js";
import { authenticateSocket } from "./socket.auth.js";
import { createCallManager } from "./call.manager.js";
import {
    createRateLimiter,
    isAllowedOrigin,
    readAllowedOrigins
} from "./socket.helpers.js";

const SIGNAL_TYPES = new Set(["ready", "offer", "answer", "candidate"]);
const MAX_SDP_LENGTH = 20000;

const userRoom = (userId) => `user:${userId}`;

const reply = (ack, payload) => {
    if (typeof ack === "function") ack(payload);
};

/* Forward only the fields WebRTC needs, never whatever the client sent. */
const cleanSignal = (data) => {
    if (!data || typeof data !== "object" || !SIGNAL_TYPES.has(data.type)) return null;

    const signal = { type: data.type };

    if (typeof data.sdp === "string" && data.sdp.length <= MAX_SDP_LENGTH) {
        signal.sdp = data.sdp;
    }

    if (data.candidate && typeof data.candidate === "object") {
        const { candidate, sdpMid, sdpMLineIndex, usernameFragment } = data.candidate;

        signal.candidate = {
            candidate: typeof candidate === "string" ? candidate.slice(0, 1000) : "",
            sdpMid: typeof sdpMid === "string" ? sdpMid : null,
            sdpMLineIndex: Number.isInteger(sdpMLineIndex) ? sdpMLineIndex : null,
            usernameFragment: typeof usernameFragment === "string" ? usernameFragment : null
        };
    }

    return signal;
};

export const initSocket = (httpServer, options = {}) => {
    const allowedOrigins = readAllowedOrigins();

    const io = new Server(httpServer, {
        cors: { origin: allowedOrigins, credentials: true },
        allowRequest: (req, callback) =>
            callback(null, isAllowedOrigin(req.headers.origin, req.headers.host, allowedOrigins)),
        maxHttpBufferSize: 64 * 1024
    });

    const messageLimiter = createRateLimiter({ limit: 20, windowMs: 10000 });
    const forwardLimiter = createRateLimiter({ limit: 10, windowMs: 60000 });
    const typingLimiter = createRateLimiter({ limit: 15, windowMs: 5000 });
    const signalLimiter = createRateLimiter({ limit: 300, windowMs: 10000 });
    const inviteLimiter = createRateLimiter({ limit: options.inviteLimit ?? 5, windowMs: 60000 });

    const hasSocket = (userId) => (io.sockets.adapter.rooms.get(userRoom(userId))?.size || 0) > 0;

    const emitToBoth = (call, event, payload) =>
        io.to(userRoom(call.callerId)).to(userRoom(call.calleeId)).emit(event, payload);

    const finalizeCall = async ({ call, outcome, durationSec }) => {
        emitToBoth(call, "call:ended", {
            callId: call.id,
            conversationId: call.conversationId,
            outcome,
            durationSec
        });

        try {
            const { message } = await logCall({
                conversationId: call.conversationId,
                callerId: call.callerId,
                outcome,
                durationSec
            });

            emitToBoth(call, "chat:message", message);
        } catch (error) {
            console.error("[call] could not save the call log:", error.message);
        }
    };

    const calls = createCallManager({
        ringTimeoutMs: options.ringTimeoutMs,
        onTimeout: (result) => finalizeCall(result).catch(() => {})
    });

    io.use(authenticateSocket);

    io.on("connection", (socket) => {
        const me = socket.data.user;

        socket.join(userRoom(me.id));

        /* Wraps a handler so errors become a clean { ok:false, error } ack. */
        const on = (event, handler) =>
            socket.on(event, async (payload, ack) => {
                try {
                    await handler(payload && typeof payload === "object" ? payload : {}, ack);
                } catch (error) {
                    if (error instanceof ApiError) {
                        return reply(ack, { ok: false, error: error.message });
                    }

                    console.error(`[socket] ${event} failed:`, error);

                    return reply(ack, { ok: false, error: "Something went wrong" });
                }
            });

        /* ---------------- chat ---------------- */

        on("chat:send", async ({ conversationId, text, clientId, replyToId }, ack) => {
            if (!messageLimiter.allow(me.id)) {
                throw new ApiError(429, "You are sending messages too fast. Please slow down.");
            }

            const { message, recipientId } = await sendMessage({
                conversationId,
                senderId: me.id,
                text,
                replyToId
            });

            const payload = {
                ...message,
                clientId: typeof clientId === "string" ? clientId.slice(0, 64) : undefined
            };

            io.to(userRoom(recipientId)).emit("chat:message", payload);
            socket.to(userRoom(me.id)).emit("chat:message", payload);

            reply(ack, { ok: true, message: payload });
        });

        /* Forward one message to a few other chats. */
        on("chat:forward", async ({ messageId, conversationIds }, ack) => {
            if (!forwardLimiter.allow(me.id)) {
                throw new ApiError(429, "You are forwarding too fast. Please wait a minute.");
            }

            const sent = await forwardMessage({ messageId, userId: me.id, conversationIds });

            for (const { message, recipientId } of sent) {
                io.to(userRoom(recipientId)).emit("chat:message", message);
                socket.to(userRoom(me.id)).emit("chat:message", message);
            }

            reply(ack, { ok: true, messages: sent.map((item) => item.message) });
        });

        on("chat:typing", async ({ conversationId, isTyping }) => {
            if (!typingLimiter.allow(me.id)) return;

            const conversation = await getConversationFor(conversationId, me.id);

            io.to(userRoom(otherParticipant(conversation, me.id))).emit("chat:typing", {
                conversationId: String(conversation._id),
                userId: me.id,
                isTyping: Boolean(isTyping)
            });
        });

        on("chat:read", async ({ conversationId }, ack) => {
            const result = await markRead({ conversationId, userId: me.id });

            io.to(userRoom(result.otherId)).emit("chat:read", {
                conversationId: result.conversationId,
                readerId: me.id
            });

            reply(ack, { ok: true });
        });

        /* ---------------- video calls ---------------- */

        on("call:invite", async ({ conversationId }, ack) => {
            if (!inviteLimiter.allow(me.id)) {
                throw new ApiError(429, "Too many call attempts. Please wait a minute.");
            }

            /* The callee comes from the conversation, never from the client. */
            const conversation = await getConversationFor(conversationId, me.id);
            const calleeId = otherParticipant(conversation, me.id);

            if (calls.isBusy(me.id)) throw new ApiError(409, "You are already in a call.");
            if (calls.isBusy(calleeId)) throw new ApiError(409, "They are on another call.");

            if (!hasSocket(calleeId)) {
                const { message } = await logCall({
                    conversationId: String(conversation._id),
                    callerId: me.id,
                    outcome: "missed"
                });

                io.to(userRoom(me.id)).to(userRoom(calleeId)).emit("chat:message", message);

                throw new ApiError(409, "They are offline right now. A missed-call note was left in the chat.");
            }

            const result = calls.invite({
                callerId: me.id,
                callerSocketId: socket.id,
                calleeId,
                conversationId: String(conversation._id)
            });

            if (!result.ok) throw new ApiError(409, "This call cannot be started right now.");

            io.to(userRoom(calleeId)).emit("call:incoming", {
                callId: result.call.id,
                conversationId: String(conversation._id),
                from: me
            });

            reply(ack, { ok: true, callId: result.call.id });
        });

        on("call:accept", async ({ callId }, ack) => {
            const result = calls.accept({ callId, userId: me.id, socketId: socket.id });

            if (!result.ok) throw new ApiError(409, "This call is no longer available.");

            io.to(result.call.callerSocketId).emit("call:accepted", { callId });
            socket.to(userRoom(me.id)).emit("call:taken", { callId });

            reply(ack, { ok: true });
        });

        /* Hang up, cancel before it is answered, or decline: all one event. */
        on("call:end", async ({ callId }, ack) => {
            const result = calls.end({ callId, userId: me.id });

            if (!result.ok) return reply(ack, { ok: false, error: "Call not found" });

            await finalizeCall(result);

            return reply(ack, { ok: true });
        });

        on("call:signal", async ({ callId, data }) => {
            if (!signalLimiter.allow(me.id)) return;

            const signal = cleanSignal(data);
            const peer = signal && calls.peerSocketId({ callId, socketId: socket.id });

            if (peer) io.to(peer).emit("call:signal", { callId, data: signal });
        });

        socket.on("disconnect", () => {
            const result = calls.socketGone({
                userId: me.id,
                socketId: socket.id,
                hasOtherSockets: hasSocket(me.id)
            });

            if (result) finalizeCall(result).catch(() => {});
        });
    });

    return io;
};
