import http from "node:http";
import { io as connect } from "socket.io-client";

import { ROLES, createUser, startTestDb, stopTestDb } from "./helpers/env.js";
import { Conversation } from "../../src/models/conversation.model.js";
import { Message } from "../../src/models/message.model.js";
import { User } from "../../src/models/user.model.js";
import { openConversation } from "../../src/services/chat.service.js";

let mongod;
let server;
let io;
let url;
let host;

const open = [];

const openSocket = (cookie, headers = {}) =>
    new Promise((resolve, reject) => {
        const socket = connect(url, {
            transports: ["websocket"],
            forceNew: true,
            reconnection: false,
            extraHeaders: { cookie, ...headers }
        });

        open.push(socket);
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", reject);
    });

const once = (socket, event, ms = 2000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), ms);

        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });

const silence = (socket, event, ms = 300) =>
    new Promise((resolve, reject) => {
        const onEvent = () => reject(new Error(`Did not expect "${event}"`));

        socket.once(event, onEvent);
        setTimeout(() => {
            socket.off(event, onEvent);
            resolve();
        }, ms);
    });

const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Re-reads until the check passes: some records are saved just after their event is sent. */
const eventually = async (read, check = Boolean, ms = 2000) => {
    const stop = Date.now() + ms;

    for (;;) {
        const value = await read();

        if (check(value) || Date.now() > stop) return value;

        await wait(50);
    }
};

const pair = async (roleA = "farmer", roleB = "buyer") => {
    const a = await createUser(roleA);
    const b = await createUser(roleB);
    const { conversation } = await openConversation(a.id, b.id);

    return { a, b, conversationId: String(conversation._id) };
};

beforeAll(async () => {
    mongod = await startTestDb();

    const { app } = await import("../../src/app.js");
    const { initSocket } = await import("../../src/sockets/index.js");

    server = http.createServer(app);
    io = initSocket(server, { ringTimeoutMs: 1500, inviteLimit: 1000 });

    await new Promise((resolve) => server.listen(0, resolve));

    host = `localhost:${server.address().port}`;
    url = `http://${host}`;
});

afterEach(() => {
    while (open.length) open.pop().disconnect();
});

afterAll(async () => {
    await wait(1800); // let ringing calls from the last tests time out and finish logging
    await new Promise((resolve) => io.close(resolve));
    await stopTestDb(mongod);
});

describe("connecting", () => {
    it("rejects a connection without a session", async () => {
        await expect(openSocket("")).rejects.toThrow("unauthorized");
    });

    it("rejects a forged token", async () => {
        await expect(openSocket("accessToken=forged.token.value")).rejects.toThrow("unauthorized");
    });

    it("rejects deactivated accounts", async () => {
        const user = await createUser("user");
        await User.updateOne({ _id: user.id }, { isActive: false });

        await expect(openSocket(user.cookie)).rejects.toThrow("unauthorized");
    });

    it("rejects a page from another website (cross-site hijacking)", async () => {
        const user = await createUser("user");

        await expect(openSocket(user.cookie, { origin: "https://evil.example" })).rejects.toBeTruthy();
    });

    it("accepts the site's own origin", async () => {
        const user = await createUser("user");
        const socket = await openSocket(user.cookie, { origin: url });

        expect(socket.connected).toBe(true);
    });
});

describe("messaging", () => {
    it("delivers a message in real time and saves it", async () => {
        const { a, b, conversationId } = await pair();
        const sender = await openSocket(a.cookie);
        const receiver = await openSocket(b.cookie);

        const incoming = once(receiver, "chat:message");
        const ack = await ask(sender, "chat:send", { conversationId, text: "  Namaste  ", clientId: "c1" });
        const message = await incoming;

        expect(ack.ok).toBe(true);
        expect(ack.message.clientId).toBe("c1");
        expect(message.text).toBe("Namaste");
        expect(message.senderId).toBe(a.id);
        expect(await Message.countDocuments({ conversation: conversationId, text: "Namaste" })).toBe(1);

        const conversation = await Conversation.findById(conversationId).lean();
        expect(conversation.unread[b.id]).toBe(1);
    });

    it("shows the sender's own message on their other open tabs", async () => {
        const { a, b, conversationId } = await pair();
        const tab1 = await openSocket(a.cookie);
        const tab2 = await openSocket(a.cookie);

        await openSocket(b.cookie);

        const mirrored = once(tab2, "chat:message");
        await ask(tab1, "chat:send", { conversationId, text: "from tab one" });

        expect((await mirrored).text).toBe("from tab one");
    });

    it("keeps outsiders out of other people's conversations", async () => {
        const { a, b, conversationId } = await pair();
        const outsider = await createUser("doctor");
        const spy = await openSocket(outsider.cookie);
        const receiver = await openSocket(b.cookie);

        const ack = await ask(spy, "chat:send", { conversationId, text: "let me in" });

        expect(ack.ok).toBe(false);
        expect(ack.error).toContain("not found");
        await silence(receiver, "chat:message");
        expect(await Message.countDocuments({ conversation: conversationId })).toBe(0);
        expect(a.id).toBeTruthy();
    });

    it("rejects empty, oversized, non-text and malformed messages", async () => {
        const { a, conversationId } = await pair();
        const socket = await openSocket(a.cookie);

        expect((await ask(socket, "chat:send", { conversationId, text: "   " })).ok).toBe(false);
        expect((await ask(socket, "chat:send", { conversationId, text: "x".repeat(2001) })).ok).toBe(false);
        expect((await ask(socket, "chat:send", { conversationId, text: { $ne: 1 } })).ok).toBe(false);
        expect((await ask(socket, "chat:send", { conversationId: { $ne: null }, text: "hi" })).ok).toBe(false);
        expect((await ask(socket, "chat:send", "not an object")).ok).toBe(false);
        expect(await Message.countDocuments({ conversation: conversationId })).toBe(0);
    });

    it("stops message flooding", async () => {
        const { a, conversationId } = await pair();
        const socket = await openSocket(a.cookie);
        const results = [];

        for (let i = 0; i < 25; i++) {
            results.push(await ask(socket, "chat:send", { conversationId, text: `spam ${i}` }));
        }

        const blocked = results.filter((r) => !r.ok);

        expect(results.filter((r) => r.ok)).toHaveLength(20);
        expect(blocked.length).toBe(5);
        expect(blocked[0].error).toContain("too fast");
    });

    it("stops delivering to a user who was deactivated after connecting", async () => {
        const { a, b, conversationId } = await pair();
        const sender = await openSocket(a.cookie);

        await User.updateOne({ _id: b.id }, { isActive: false });

        const ack = await ask(sender, "chat:send", { conversationId, text: "hello?" });

        expect(ack.ok).toBe(false);
    });

    it("relays typing indicators to the other person only", async () => {
        const { a, b, conversationId } = await pair();
        const typist = await openSocket(a.cookie);
        const other = await openSocket(b.cookie);

        const seen = once(other, "chat:typing");
        typist.emit("chat:typing", { conversationId, isTyping: true });

        expect(await seen).toEqual({ conversationId, userId: a.id, isTyping: true });
        await silence(typist, "chat:typing");
    });

    it("clears unread counts and tells the sender when messages are read", async () => {
        const { a, b, conversationId } = await pair();
        const sender = await openSocket(a.cookie);
        const reader = await openSocket(b.cookie);

        await ask(sender, "chat:send", { conversationId, text: "one" });
        await ask(sender, "chat:send", { conversationId, text: "two" });

        const receipt = once(sender, "chat:read");
        const ack = await ask(reader, "chat:read", { conversationId });

        expect(ack.ok).toBe(true);
        expect((await receipt).readerId).toBe(b.id);
        expect((await Conversation.findById(conversationId).lean()).unread[b.id]).toBe(0);
    });
});

describe("every role can chat with every role", () => {
    const combos = ROLES.flatMap((from) => ROLES.map((to) => [from, to]));
    const people = {};

    beforeAll(async () => {
        for (const role of ROLES) {
            people[role] = [await createUser(role), await createUser(role)];
        }
    });

    it.each(combos)("%s -> %s", async (fromRole, toRole) => {
        const sender = people[fromRole][0];
        const receiver = people[toRole][fromRole === toRole ? 1 : 0];
        const { conversation } = await openConversation(sender.id, receiver.id);
        const conversationId = String(conversation._id);

        const a = await openSocket(sender.cookie);
        const b = await openSocket(receiver.cookie);

        const incoming = once(b, "chat:message");
        const ack = await ask(a, "chat:send", { conversationId, text: `${fromRole} to ${toRole}` });

        expect(ack.ok).toBe(true);
        expect((await incoming).text).toBe(`${fromRole} to ${toRole}`);
    });
});

describe("video calls", () => {
    it("runs a full call: ring, accept, signalling, hang up, call log", async () => {
        const { a, b, conversationId } = await pair("farmer", "doctor");
        const caller = await openSocket(a.cookie);
        const callee = await openSocket(b.cookie);

        const ringing = once(callee, "call:incoming");
        const invited = await ask(caller, "call:invite", { conversationId });
        const ring = await ringing;

        expect(invited.ok).toBe(true);
        expect(ring.callId).toBe(invited.callId);
        expect(ring.from.id).toBe(a.id);
        expect(ring.from.fullName).toBe(a.user.fullName);

        const accepted = once(caller, "call:accepted");
        expect((await ask(callee, "call:accept", { callId: ring.callId })).ok).toBe(true);
        await accepted;

        const ready = once(caller, "call:signal");
        callee.emit("call:signal", { callId: ring.callId, data: { type: "ready" } });
        expect((await ready).data.type).toBe("ready");

        const offer = once(callee, "call:signal");
        caller.emit("call:signal", { callId: ring.callId, data: { type: "offer", sdp: "v=0 offer" } });
        expect((await offer).data).toEqual({ type: "offer", sdp: "v=0 offer" });

        const candidate = once(caller, "call:signal");
        callee.emit("call:signal", {
            callId: ring.callId,
            data: { type: "candidate", candidate: { candidate: "candidate:1 1 udp 1 1.1.1.1 1 typ host", sdpMid: "0", sdpMLineIndex: 0, evil: "dropped" } }
        });
        const relayed = (await candidate).data.candidate;
        expect(relayed.sdpMid).toBe("0");
        expect(relayed.evil).toBe(undefined);

        const endedForCallee = once(callee, "call:ended");
        await wait(1100);
        await ask(caller, "call:end", { callId: ring.callId });

        const ended = await endedForCallee;

        expect(ended.outcome).toBe("ended");
        expect(ended.durationSec >= 1).toBe(true);

        const log = await Message.findOne({ conversation: conversationId, type: "call" }).lean();

        expect(log.call.outcome).toBe("ended");
        expect(String(log.sender)).toBe(a.id);
    });

    it("lets the callee decline and logs it", async () => {
        const { a, b, conversationId } = await pair("buyer", "farmer");
        const caller = await openSocket(a.cookie);
        const callee = await openSocket(b.cookie);

        const ringing = once(callee, "call:incoming");
        await ask(caller, "call:invite", { conversationId });
        const { callId } = await ringing;

        const ended = once(caller, "call:ended");
        await ask(callee, "call:end", { callId });

        expect((await ended).outcome).toBe("declined");
        expect((await Message.findOne({ conversation: conversationId, type: "call" }).lean()).call.outcome).toBe("declined");
    });

    it("rings other tabs of the callee and dismisses them when one answers", async () => {
        const { a, b, conversationId } = await pair();
        const caller = await openSocket(a.cookie);
        const tab1 = await openSocket(b.cookie);
        const tab2 = await openSocket(b.cookie);

        const ring1 = once(tab1, "call:incoming");
        const ring2 = once(tab2, "call:incoming");
        await ask(caller, "call:invite", { conversationId });
        const { callId } = await ring1;
        await ring2;

        const taken = once(tab2, "call:taken");
        await ask(tab1, "call:accept", { callId });

        expect((await taken).callId).toBe(callId);
    });

    it("reports busy lines", async () => {
        const first = await pair();
        const carol = await createUser("doctor");
        const { conversation } = await openConversation(carol.id, first.b.id);

        const caller = await openSocket(first.a.cookie);
        const callee = await openSocket(first.b.cookie);
        const third = await openSocket(carol.cookie);

        await ask(caller, "call:invite", { conversationId: first.conversationId });

        const secondCall = await ask(third, "call:invite", { conversationId: String(conversation._id) });
        const again = await ask(caller, "call:invite", { conversationId: first.conversationId });

        expect(secondCall.ok).toBe(false);
        expect(secondCall.error).toContain("another call");
        expect(again.ok).toBe(false);
        expect(again.error).toContain("already in a call");
        expect(callee.connected).toBe(true);
    });

    it("leaves a missed-call note when the other person is offline", async () => {
        const { a, b, conversationId } = await pair();
        const caller = await openSocket(a.cookie);

        const ack = await ask(caller, "call:invite", { conversationId });

        expect(ack.ok).toBe(false);
        expect(ack.error).toContain("offline");

        const log = await Message.findOne({ conversation: conversationId, type: "call" }).lean();

        expect(log.call.outcome).toBe("missed");
        expect((await Conversation.findById(conversationId).lean()).unread[b.id]).toBe(1);
    });

    it("marks an unanswered call as missed after the ring timeout", async () => {
        const { a, b, conversationId } = await pair();
        const caller = await openSocket(a.cookie);
        const callee = await openSocket(b.cookie);

        const ringing = once(callee, "call:incoming");
        await ask(caller, "call:invite", { conversationId });
        await ringing;

        const ended = await once(caller, "call:ended", 4000);

        expect(ended.outcome).toBe("missed");

        const log = await eventually(() => Message.findOne({ conversation: conversationId, type: "call" }).lean());

        expect(log.call.outcome).toBe("missed");
    });

    it("ends the call for the other person when someone's connection drops", async () => {
        const { a, b, conversationId } = await pair();
        const caller = await openSocket(a.cookie);
        const callee = await openSocket(b.cookie);

        const ringing = once(callee, "call:incoming");
        await ask(caller, "call:invite", { conversationId });
        const { callId } = await ringing;
        await ask(callee, "call:accept", { callId });

        const ended = once(caller, "call:ended");
        callee.disconnect();

        expect((await ended).outcome).toBe("ended");
    });

    it("never relays signals before the call is answered or to outsiders", async () => {
        const { a, b, conversationId } = await pair();
        const outsider = await createUser("buyer");
        const caller = await openSocket(a.cookie);
        const callee = await openSocket(b.cookie);
        const spy = await openSocket(outsider.cookie);

        const ringing = once(callee, "call:incoming");
        await ask(caller, "call:invite", { conversationId });
        const { callId } = await ringing;

        caller.emit("call:signal", { callId, data: { type: "offer", sdp: "too early" } });
        await silence(callee, "call:signal");

        const accepted = once(caller, "call:accepted");
        await ask(callee, "call:accept", { callId });
        await accepted;

        spy.emit("call:signal", { callId, data: { type: "offer", sdp: "hijack" } });
        await silence(callee, "call:signal");
        await silence(caller, "call:signal");
    });

    it("cannot be started in someone else's conversation", async () => {
        const { conversationId } = await pair();
        const outsider = await createUser("farmer");
        const socket = await openSocket(outsider.cookie);

        const ack = await ask(socket, "call:invite", { conversationId });

        expect(ack.ok).toBe(false);
        expect(ack.error).toContain("not found");
    });

    it("cannot accept or end a call you are not part of", async () => {
        const { a, b, conversationId } = await pair();
        const outsider = await createUser("doctor");
        const caller = await openSocket(a.cookie);
        const callee = await openSocket(b.cookie);
        const spy = await openSocket(outsider.cookie);

        const ringing = once(callee, "call:incoming");
        await ask(caller, "call:invite", { conversationId });
        const { callId } = await ringing;

        expect((await ask(spy, "call:accept", { callId })).ok).toBe(false);
        expect((await ask(spy, "call:end", { callId })).ok).toBe(false);
    });
});