import { createCallManager } from "../../src/sockets/call.manager.js";

/* A manual clock and timer so ringing timeouts can be tested instantly. */
const setup = (options = {}) => {
    let time = 1_000_000;
    let nextTimerId = 1;
    let nextCallId = 0;
    const timers = new Map();
    const timedOut = [];

    const manager = createCallManager({
        ringTimeoutMs: 30_000,
        now: () => time,
        newId: () => `call-${++nextCallId}`,
        setTimer: (fn, ms) => {
            const id = nextTimerId++;
            timers.set(id, { fn, at: time + ms });
            return id;
        },
        clearTimer: (id) => timers.delete(id),
        onTimeout: (result) => timedOut.push(result),
        ...options
    });

    const advance = (ms) => {
        time += ms;

        for (const [id, timer] of [...timers]) {
            if (timer.at <= time) {
                timers.delete(id);
                timer.fn();
            }
        }
    };

    return { manager, advance, timers, timedOut };
};

const invite = (manager, overrides = {}) =>
    manager.invite({
        callerId: "alice",
        callerSocketId: "sock-alice",
        calleeId: "bob",
        conversationId: "conv-1",
        ...overrides
    });

describe("call manager: starting calls", () => {
    it("rings the callee and marks both users busy", () => {
        const { manager } = setup();
        const result = invite(manager);

        expect(result.ok).toBe(true);
        expect(result.call.state).toBe("ringing");
        expect(result.call.callerId).toBe("alice");
        expect(result.call.calleeId).toBe("bob");
        expect(manager.isBusy("alice")).toBe(true);
        expect(manager.isBusy("bob")).toBe(true);
    });

    it("does not let someone call themselves", () => {
        const { manager } = setup();
        const result = invite(manager, { calleeId: "alice" });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe("self");
    });

    it("rejects a second call from a user who is already calling", () => {
        const { manager } = setup();
        invite(manager);

        const result = invite(manager, { calleeId: "carol" });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe("caller_busy");
    });

    it("tells a third person that the callee is busy", () => {
        const { manager } = setup();
        invite(manager);

        const result = invite(manager, { callerId: "carol", callerSocketId: "sock-carol" });

        expect(result.ok).toBe(false);
        expect(result.reason).toBe("callee_busy");
    });
});

describe("call manager: answering", () => {
    it("lets only the callee accept, and only once", () => {
        const { manager } = setup();
        const { call } = invite(manager);

        expect(manager.accept({ callId: call.id, userId: "mallory", socketId: "x" }).ok).toBe(false);
        expect(manager.accept({ callId: call.id, userId: "alice", socketId: "sock-alice" }).ok).toBe(false);

        const accepted = manager.accept({ callId: call.id, userId: "bob", socketId: "sock-bob" });

        expect(accepted.ok).toBe(true);
        expect(accepted.call.state).toBe("active");
        expect(accepted.call.calleeSocketId).toBe("sock-bob");
        expect(manager.accept({ callId: call.id, userId: "bob", socketId: "sock-bob-2" }).ok).toBe(false);
    });

    it("stops the ring timer once the call is accepted", () => {
        const { manager, timers, timedOut, advance } = setup();
        const { call } = invite(manager);

        manager.accept({ callId: call.id, userId: "bob", socketId: "sock-bob" });

        expect(timers.size).toBe(0);

        advance(60_000);

        expect(timedOut).toHaveLength(0);
        expect(manager.isBusy("alice")).toBe(true);
    });

    it("cannot accept an unknown call", () => {
        const { manager } = setup();

        expect(manager.accept({ callId: "nope", userId: "bob", socketId: "s" }).ok).toBe(false);
    });
});

describe("call manager: ending calls", () => {
    it("marks an unanswered call as missed when the ring times out", () => {
        const { manager, advance, timedOut } = setup();
        invite(manager);

        advance(29_999);
        expect(timedOut).toHaveLength(0);

        advance(1);
        expect(timedOut).toHaveLength(1);
        expect(timedOut[0].outcome).toBe("missed");
        expect(timedOut[0].call.id).toBe("call-1");
        expect(manager.isBusy("alice")).toBe(false);
        expect(manager.isBusy("bob")).toBe(false);
    });

    it("counts a caller cancelling before an answer as missed", () => {
        const { manager } = setup();
        const { call } = invite(manager);
        const result = manager.end({ callId: call.id, userId: "alice" });

        expect(result.ok).toBe(true);
        expect(result.outcome).toBe("missed");
        expect(result.durationSec).toBe(0);
    });

    it("counts the callee hanging up while ringing as declined", () => {
        const { manager } = setup();
        const { call } = invite(manager);
        const result = manager.end({ callId: call.id, userId: "bob" });

        expect(result.outcome).toBe("declined");
        expect(manager.isBusy("bob")).toBe(false);
    });

    it("reports the duration of a connected call", () => {
        const { manager, advance } = setup();
        const { call } = invite(manager);

        manager.accept({ callId: call.id, userId: "bob", socketId: "sock-bob" });
        advance(125_000);

        const result = manager.end({ callId: call.id, userId: "alice" });

        expect(result.outcome).toBe("ended");
        expect(result.durationSec).toBe(125);
    });

    it("ignores people who are not part of the call", () => {
        const { manager } = setup();
        const { call } = invite(manager);

        expect(manager.end({ callId: call.id, userId: "mallory" }).ok).toBe(false);
        expect(manager.isBusy("alice")).toBe(true);
    });

    it("frees both users so they can call again", () => {
        const { manager } = setup();
        const { call } = invite(manager);

        manager.end({ callId: call.id, userId: "alice" });

        expect(invite(manager).ok).toBe(true);
    });
});

describe("call manager: relaying signals", () => {
    it("only relays between the two registered sockets of an active call", () => {
        const { manager } = setup();
        const { call } = invite(manager);

        expect(manager.peerSocketId({ callId: call.id, socketId: "sock-alice" })).toBeNull();

        manager.accept({ callId: call.id, userId: "bob", socketId: "sock-bob" });

        expect(manager.peerSocketId({ callId: call.id, socketId: "sock-alice" })).toBe("sock-bob");
        expect(manager.peerSocketId({ callId: call.id, socketId: "sock-bob" })).toBe("sock-alice");
        expect(manager.peerSocketId({ callId: call.id, socketId: "sock-mallory" })).toBeNull();
        expect(manager.peerSocketId({ callId: "other", socketId: "sock-alice" })).toBeNull();
    });
});

describe("call manager: disconnects", () => {
    it("misses the call when the caller's tab closes while ringing", () => {
        const { manager } = setup();
        invite(manager);

        const result = manager.socketGone({ userId: "alice", socketId: "sock-alice" });

        expect(result.outcome).toBe("missed");
        expect(manager.isBusy("bob")).toBe(false);
    });

    it("keeps ringing while the callee still has another tab open", () => {
        const { manager } = setup();
        invite(manager);

        const result = manager.socketGone({ userId: "bob", socketId: "tab-1", hasOtherSockets: true });

        expect(result).toBeNull();
        expect(manager.isBusy("bob")).toBe(true);
    });

    it("misses the call when the callee's last tab closes", () => {
        const { manager } = setup();
        invite(manager);

        const result = manager.socketGone({ userId: "bob", socketId: "tab-1", hasOtherSockets: false });

        expect(result.outcome).toBe("missed");
    });

    it("ends an active call when either person's call tab disconnects", () => {
        const { manager } = setup();
        const { call } = invite(manager);

        manager.accept({ callId: call.id, userId: "bob", socketId: "sock-bob" });

        expect(manager.socketGone({ userId: "bob", socketId: "other-tab" })).toBeNull();

        const result = manager.socketGone({ userId: "bob", socketId: "sock-bob" });

        expect(result.outcome).toBe("ended");
        expect(manager.isBusy("alice")).toBe(false);
    });

    it("does nothing for users who are not in a call", () => {
        const { manager } = setup();

        expect(manager.socketGone({ userId: "zed", socketId: "s" })).toBeNull();
    });
});
