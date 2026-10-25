import crypto from "node:crypto";

/*
 * In-memory state machine for 1-to-1 video calls. It knows nothing about
 * sockets or the database, so it can be unit tested with a fake clock.
 *
 *   ringing --accept--> active --end / socket gone--> finished (ended)
 *   ringing --timeout / caller cancels / callee has no tab left--> finished (missed)
 *   ringing --callee declines--> finished (declined)
 */

export const CALL_STATE = Object.freeze({ RINGING: "ringing", ACTIVE: "active" });
export const CALL_OUTCOME = Object.freeze({
    ENDED: "ended",
    MISSED: "missed",
    DECLINED: "declined"
});
export const DEFAULT_RING_TIMEOUT_MS = 30000;

export const createCallManager = ({
    ringTimeoutMs = DEFAULT_RING_TIMEOUT_MS,
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    newId = () => crypto.randomUUID(),
    onTimeout = () => {}
} = {}) => {
    const calls = new Map();
    const callIdByUser = new Map();
    const timers = new Map();

    const snapshot = (call) => ({ ...call });

    const stopTimer = (callId) => {
        if (timers.has(callId)) clearTimer(timers.get(callId));
        timers.delete(callId);
    };

    const finish = (call, outcome) => {
        stopTimer(call.id);
        calls.delete(call.id);
        callIdByUser.delete(call.callerId);
        callIdByUser.delete(call.calleeId);

        const durationSec = call.answeredAt
            ? Math.max(0, Math.round((now() - call.answeredAt) / 1000))
            : 0;

        return { call: snapshot(call), outcome, durationSec };
    };

    const isBusy = (userId) => callIdByUser.has(String(userId));

    const invite = ({ callerId, callerSocketId, calleeId, conversationId }) => {
        const caller = String(callerId);
        const callee = String(calleeId);

        if (caller === callee) return { ok: false, reason: "self" };
        if (isBusy(caller)) return { ok: false, reason: "caller_busy" };
        if (isBusy(callee)) return { ok: false, reason: "callee_busy" };

        const call = {
            id: newId(),
            callerId: caller,
            calleeId: callee,
            callerSocketId,
            calleeSocketId: null,
            conversationId: String(conversationId),
            state: CALL_STATE.RINGING,
            createdAt: now(),
            answeredAt: null
        };

        calls.set(call.id, call);
        callIdByUser.set(caller, call.id);
        callIdByUser.set(callee, call.id);

        timers.set(
            call.id,
            setTimer(() => {
                const live = calls.get(call.id);

                if (live && live.state === CALL_STATE.RINGING) {
                    onTimeout(finish(live, CALL_OUTCOME.MISSED));
                }
            }, ringTimeoutMs)
        );

        return { ok: true, call: snapshot(call) };
    };

    const accept = ({ callId, userId, socketId }) => {
        const call = calls.get(callId);

        if (!call || call.calleeId !== String(userId) || call.state !== CALL_STATE.RINGING) {
            return { ok: false, reason: "not_available" };
        }

        stopTimer(call.id);

        call.state = CALL_STATE.ACTIVE;
        call.calleeSocketId = socketId;
        call.answeredAt = now();

        return { ok: true, call: snapshot(call) };
    };

    /* Hang up, cancel (caller, still ringing) or decline (callee, still ringing). */
    const end = ({ callId, userId }) => {
        const call = calls.get(callId);
        const user = String(userId);

        if (!call || (user !== call.callerId && user !== call.calleeId)) {
            return { ok: false, reason: "not_found" };
        }

        if (call.state === CALL_STATE.ACTIVE) {
            return { ok: true, ...finish(call, CALL_OUTCOME.ENDED) };
        }

        const outcome =
            user === call.callerId ? CALL_OUTCOME.MISSED : CALL_OUTCOME.DECLINED;

        return { ok: true, ...finish(call, outcome) };
    };

    /* Which socket should receive a signal sent by `socketId`? Only during an active call. */
    const peerSocketId = ({ callId, socketId }) => {
        const call = calls.get(callId);

        if (!call || call.state !== CALL_STATE.ACTIVE) return null;
        if (socketId === call.callerSocketId) return call.calleeSocketId;
        if (socketId === call.calleeSocketId) return call.callerSocketId;

        return null;
    };

    /* A socket disconnected. Returns a finished-call result, or null if nothing changes. */
    const socketGone = ({ userId, socketId, hasOtherSockets = false }) => {
        const user = String(userId);
        const call = calls.get(callIdByUser.get(user));

        if (!call) return null;

        const isCaller = user === call.callerId;

        if (call.state === CALL_STATE.ACTIVE) {
            const mine = isCaller ? call.callerSocketId : call.calleeSocketId;

            return mine === socketId ? finish(call, CALL_OUTCOME.ENDED) : null;
        }

        if (isCaller) {
            return call.callerSocketId === socketId ? finish(call, CALL_OUTCOME.MISSED) : null;
        }

        return hasOtherSockets ? null : finish(call, CALL_OUTCOME.MISSED);
    };

    return { invite, accept, end, peerSocketId, socketGone, isBusy };
};
