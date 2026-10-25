import request from "supertest";

import { createUser, startTestDb, stopTestDb } from "./helpers/env.js";
import { Message } from "../../src/models/message.model.js";
import { User } from "../../src/models/user.model.js";
import { openConversation, sendMessage } from "../../src/services/chat.service.js";

let mongod;
let app;
let alice;
let bob;
let carol;

const get = (path, who) => request(app).get(path).set("Accept", "application/json").set("Cookie", who.cookie);
const post = (path, who, body) =>
    request(app).post(path).set("Accept", "application/json").set("Cookie", who.cookie).send(body);

beforeAll(async () => {
    mongod = await startTestDb();
    ({ app } = await import("../../src/app.js"));

    alice = await createUser("farmer", { fullName: "Alice Kumar" });
    bob = await createUser("doctor", { fullName: "Bob Singh" });
    carol = await createUser("buyer", { fullName: "Carol Devi" });
});

afterAll(async () => {
    await stopTestDb(mongod);
});

describe("authentication", () => {
    it("sends signed-out browsers to the login page", async () => {
        const res = await request(app).get("/chat");

        expect(res.status).toBe(302);
        expect(res.headers.location).toContain("/login");
    });

    it("answers API calls without a session with 401 JSON", async () => {
        const res = await request(app).get("/chat/api/conversations").set("Accept", "application/json");

        expect(res.status).toBe(401);
    });

    it("rejects a forged token", async () => {
        const res = await request(app)
            .get("/chat/api/me")
            .set("Accept", "application/json")
            .set("Cookie", "accessToken=not.a.token");

        expect(res.status).toBe(401);
    });

    it("rejects a deactivated account", async () => {
        const dave = await createUser("user");
        await User.updateOne({ _id: dave.id }, { isActive: false });

        const res = await get("/chat/api/me", dave);

        expect(res.status).toBe(401);
    });
});

describe("chat page", () => {
    it("renders for a signed-in user", async () => {
        const res = await request(app).get("/chat").set("Cookie", alice.cookie);

        expect(res.status).toBe(200);
        expect(res.text).toContain('id="conversationList"');
        expect(res.text).toContain("/assets/js/chat-client.js");
    });

    it("returns the signed-in user's own profile without private fields", async () => {
        const res = await get("/chat/api/me", alice);

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(alice.id);
        expect(res.body.data.role).toBe("farmer");
        expect(JSON.stringify(res.body)).not.toContain("password");
        expect(JSON.stringify(res.body)).not.toContain("email");
    });
});

describe("finding people", () => {
    it("finds people by name or username, never including yourself", async () => {
        const res = await get("/chat/api/users?q=bob", alice);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0].id).toBe(bob.id);

        const self = await get("/chat/api/users?q=alice", alice);
        expect(self.body.data).toHaveLength(0);
    });

    it("filters by role", async () => {
        const doctors = await get("/chat/api/users?q=test&role=doctor", alice);
        const farmers = await get("/chat/api/users?q=test&role=farmer", carol);

        expect(doctors.body.data.every((u) => u.role === "doctor")).toBe(true);
        expect(farmers.body.data.every((u) => u.role === "farmer")).toBe(true);
    });

    it("needs at least two characters", async () => {
        const res = await get("/chat/api/users?q=a", alice);

        expect(res.body.data).toEqual([]);
    });

    it("hides deactivated users", async () => {
        const ghost = await createUser("buyer", { fullName: "Zeta Ghost" });
        await User.updateOne({ _id: ghost.id }, { isActive: false });

        const res = await get("/chat/api/users?q=zeta", alice);

        expect(res.body.data).toEqual([]);
    });

    it("only exposes public fields", async () => {
        const res = await get("/chat/api/users?q=bob", alice);

        expect(Object.keys(res.body.data[0]).sort()).toEqual(["avatar", "fullName", "id", "role", "username"]);
    });

    it("treats regex characters as plain text", async () => {
        const res = await get("/chat/api/users?q=.*", alice);

        expect(res.body.data).toEqual([]);
    });

    it("is not fooled by NoSQL operator injection", async () => {
        const res = await request(app)
            .get("/chat/api/users?q[$ne]=x&role[$ne]=x")
            .set("Accept", "application/json")
            .set("Cookie", alice.cookie);

        expect(res.status).toBe(200);
        expect(res.body.data).toEqual([]);
    });
});

describe("opening conversations", () => {
    it("is idempotent and the same from both sides", async () => {
        const first = await post("/chat/api/conversations", alice, { userId: bob.id });
        const again = await post("/chat/api/conversations", alice, { userId: bob.id });
        const reverse = await post("/chat/api/conversations", bob, { userId: alice.id });

        expect(first.status).toBe(200);
        expect(again.body.data.id).toBe(first.body.data.id);
        expect(reverse.body.data.id).toBe(first.body.data.id);
        expect(first.body.data.other.id).toBe(bob.id);
    });

    it("refuses to chat with yourself", async () => {
        const res = await post("/chat/api/conversations", alice, { userId: alice.id });

        expect(res.status).toBe(400);
    });

    it("rejects malformed ids and operator objects", async () => {
        const bad = await post("/chat/api/conversations", alice, { userId: "abc" });
        const injected = await post("/chat/api/conversations", alice, { userId: { $ne: null } });
        const missing = await post("/chat/api/conversations", alice, {});

        expect(bad.status).toBe(400);
        expect(injected.status).toBe(400);
        expect(missing.status).toBe(400);
    });

    it("returns 404 for unknown or deactivated users", async () => {
        const gone = await createUser("user");
        await User.updateOne({ _id: gone.id }, { isActive: false });

        const unknown = await post("/chat/api/conversations", alice, { userId: "64b000000000000000000000" });
        const inactive = await post("/chat/api/conversations", alice, { userId: gone.id });

        expect(unknown.status).toBe(404);
        expect(inactive.status).toBe(404);
    });
});

describe("conversation list and history", () => {
    let conversationId;

    beforeAll(async () => {
        const { conversation } = await openConversation(alice.id, carol.id);
        conversationId = String(conversation._id);

        for (let i = 1; i <= 45; i++) {
            await sendMessage({ conversationId, senderId: i % 2 ? alice.id : carol.id, text: `message ${i}` });
        }
    });

    it("lists only conversations that have messages, with unread counts", async () => {
        const forCarol = await get("/chat/api/conversations", carol);
        const entry = forCarol.body.data.find((c) => c.id === conversationId);

        expect(entry).toBeTruthy();
        expect(entry.other.id).toBe(alice.id);
        expect(entry.unread).toBe(23);
        expect(entry.lastMessage.text).toBe("message 45");
    });

    it("pages through history oldest-to-newest", async () => {
        const page1 = await get(`/chat/api/conversations/${conversationId}/messages?limit=30`, alice);

        expect(page1.body.data.messages).toHaveLength(30);
        expect(page1.body.data.hasMore).toBe(true);
        expect(page1.body.data.messages[29].text).toBe("message 45");
        expect(page1.body.data.messages[0].text).toBe("message 16");

        const firstId = page1.body.data.messages[0].id;
        const page2 = await get(`/chat/api/conversations/${conversationId}/messages?before=${firstId}`, alice);

        expect(page2.body.data.messages).toHaveLength(15);
        expect(page2.body.data.hasMore).toBe(false);
        expect(page2.body.data.messages[0].text).toBe("message 1");
    });

    it("caps the page size", async () => {
        const res = await get(`/chat/api/conversations/${conversationId}/messages?limit=100000`, alice);

        expect(res.body.data.messages.length <= 100).toBe(true);
    });

    it("keeps conversations private to their two participants", async () => {
        const outsider = await get(`/chat/api/conversations/${conversationId}/messages`, bob);

        expect(outsider.status).toBe(404);
    });

    it("rejects bad conversation ids and bad cursors", async () => {
        const path = `/chat/api/conversations/${conversationId}/messages`;
        const badId = await get("/chat/api/conversations/not-an-id/messages", alice);
        const badCursor = await get(`${path}?before=not-an-id`, alice);
        const operator = await get(`${path}?before[$gt]=0`, alice);
        const baseline = await get(path, alice);

        expect(badId.status).toBe(400);
        expect(badCursor.status).toBe(400);

        /* Express 4 turns before[$gt] into an object (rejected with 400); Express 5 ignores it.
           Either way it must never act as a Mongo operator. */
        expect([200, 400]).toContain(operator.status);
        if (operator.status === 200) expect(operator.body.data).toEqual(baseline.body.data);
    });

    it("stores text exactly as typed (escaping happens when rendering)", async () => {
        const xss = '<img src=x onerror="alert(1)">';
        await sendMessage({ conversationId, senderId: alice.id, text: xss });

        const res = await get(`/chat/api/conversations/${conversationId}/messages?limit=1`, alice);

        expect(res.body.data.messages[0].text).toBe(xss);
        expect(res.headers["content-type"]).toContain("application/json");
    });

    it("rejects empty, non-text and oversized messages in the service", async () => {
        const send = (text) => sendMessage({ conversationId, senderId: alice.id, text });

        await expect(send("   ")).rejects.toThrow("empty");
        await expect(send({ $ne: 1 })).rejects.toThrow("text");
        await expect(send("x".repeat(2001))).rejects.toThrow("2000");
        expect(await Message.countDocuments({ conversation: conversationId, text: "   " })).toBe(0);
    });
});

describe("ICE servers", () => {
    afterEach(() => {
        delete process.env.TURN_URLS;
        delete process.env.TURN_SECRET;
    });

    it("always includes a STUN server", async () => {
        const res = await get("/chat/api/ice-servers", alice);

        expect(res.status).toBe(200);
        expect(res.body.data.iceServers[0].urls[0]).toContain("stun:");
        expect(res.headers["cache-control"]).toContain("no-store");
    });

    it("adds short-lived TURN credentials when configured", async () => {
        process.env.TURN_URLS = "turn:turn.example.com:3478";
        process.env.TURN_SECRET = "s3cret";

        const res = await get("/chat/api/ice-servers", alice);
        const turn = res.body.data.iceServers[1];

        expect(turn.urls).toEqual(["turn:turn.example.com:3478"]);
        expect(turn.username.endsWith(`:${alice.id}`)).toBe(true);
        expect(turn.credential).toBeTruthy();
    });

    it("requires a session", async () => {
        const res = await request(app).get("/chat/api/ice-servers").set("Accept", "application/json");

        expect(res.status).toBe(401);
    });
});