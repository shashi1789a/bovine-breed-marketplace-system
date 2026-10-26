import http from "node:http";
import request from "supertest";
import { io as connect } from "socket.io-client";

import { createUser, startTestDb, stopTestDb } from "./helpers/env.js";
import { Message } from "../../src/models/message.model.js";
import { cleanFileName, contentMatchesType } from "../../src/middlewares/chatUpload.middleware.js";
import {
    forwardMessage,
    openConversation,
    sendAttachment,
    sendMessage,
    toPublicMessage
} from "../../src/services/chat.service.js";

let mongod;
let app;
let server;
let io;
let url;

const open = [];

const openSocket = (cookie) =>
    new Promise((resolve, reject) => {
        const socket = connect(url, {
            transports: ["websocket"],
            forceNew: true,
            reconnection: false,
            extraHeaders: { cookie }
        });

        open.push(socket);
        socket.once("connect", () => resolve(socket));
        socket.once("connect_error", reject);
    });

const ask = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));

const once = (socket, event, ms = 2000) =>
    new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for "${event}"`)), ms);

        socket.once(event, (payload) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });

const chatOf = async (first, second) => {
    const { conversation } = await openConversation(first.id, second.id);
    return String(conversation._id);
};

const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");

const fakeAttachment = {
    url: "https://res.cloudinary.com/demo/image/upload/sample.png",
    name: "cow.png",
    mimeType: "image/png",
    size: 1234,
    kind: "image"
};

beforeAll(async () => {
    mongod = await startTestDb();

    ({ app } = await import("../../src/app.js"));
    const { initSocket } = await import("../../src/sockets/index.js");

    server = http.createServer(app);
    io = initSocket(server, { inviteLimit: 1000 });

    await new Promise((resolve) => server.listen(0, resolve));
    url = `http://localhost:${server.address().port}`;
});

afterEach(() => {
    while (open.length) open.pop().disconnect();
});

afterAll(async () => {
    await new Promise((resolve) => io.close(resolve));
    await stopTestDb(mongod);
});

describe("replying", () => {
    it("stores a short copy of the message being answered", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const conversationId = await chatOf(a, b);

        const { message: first } = await sendMessage({ conversationId, senderId: a.id, text: "Is the cow vaccinated?" });
        const { message: answer } = await sendMessage({
            conversationId,
            senderId: b.id,
            text: "Yes, all shots done",
            replyToId: first.id
        });

        expect(answer.replyTo).toMatchObject({
            messageId: first.id,
            senderId: a.id,
            type: "text",
            text: "Is the cow vaccinated?"
        });
        expect(first.replyTo).toBeNull();
    });

    it("refuses to reply to a message from another conversation", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const c = await createUser("doctor");
        const mine = await chatOf(a, b);
        const other = await chatOf(a, c);

        const { message: secret } = await sendMessage({ conversationId: other, senderId: a.id, text: "private" });

        await expect(
            sendMessage({ conversationId: mine, senderId: a.id, text: "hi", replyToId: secret.id })
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("works over the socket and reaches the other person", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const conversationId = await chatOf(a, b);
        const sender = await openSocket(a.cookie);
        const receiver = await openSocket(b.cookie);

        const { message: first } = await sendMessage({ conversationId, senderId: b.id, text: "Price?" });

        const incoming = once(receiver, "chat:message");
        const ack = await ask(sender, "chat:send", { conversationId, text: "50000", replyToId: first.id });
        const seen = await incoming;

        expect(ack.ok).toBe(true);
        expect(seen.replyTo.messageId).toBe(first.id);
    });
});

describe("forwarding", () => {
    it("copies a text message into other chats and marks it forwarded", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const c = await createUser("doctor");
        const source = await chatOf(a, b);
        const target = await chatOf(a, c);

        const { message } = await sendMessage({ conversationId: source, senderId: b.id, text: "Gir cow, 3 years" });
        const [result] = await forwardMessage({ messageId: message.id, userId: a.id, conversationIds: [target] });

        expect(result.recipientId).toBe(c.id);
        expect(result.message).toMatchObject({
            conversationId: target,
            senderId: a.id,
            text: "Gir cow, 3 years",
            forwarded: true
        });
        expect(result.message.replyTo).toBeNull();
    });

    it("keeps the file when forwarding an attachment", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const c = await createUser("doctor");
        const source = await chatOf(a, b);
        const target = await chatOf(a, c);

        const { message } = await sendAttachment({
            conversationId: source,
            senderId: a.id,
            attachment: fakeAttachment,
            caption: "Photo of the calf"
        });
        const [result] = await forwardMessage({ messageId: message.id, userId: a.id, conversationIds: [target] });

        expect(result.message.type).toBe("file");
        expect(result.message.attachment.url).toBe(fakeAttachment.url);
        expect(result.message.text).toBe("Photo of the calf");
    });

    it("lets only people in the original chat forward from it", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const outsider = await createUser("user");
        const friend = await createUser("doctor");
        const source = await chatOf(a, b);
        const outsiderChat = await chatOf(outsider, friend);

        const { message } = await sendMessage({ conversationId: source, senderId: a.id, text: "secret" });

        await expect(
            forwardMessage({ messageId: message.id, userId: outsider.id, conversationIds: [outsiderChat] })
        ).rejects.toMatchObject({ statusCode: 404 });
    });

    it("refuses to forward into someone else's chat, and to too many chats", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const x = await createUser("user");
        const y = await createUser("doctor");
        const source = await chatOf(a, b);
        const notMine = await chatOf(x, y);

        const { message } = await sendMessage({ conversationId: source, senderId: a.id, text: "hello" });

        await expect(
            forwardMessage({ messageId: message.id, userId: a.id, conversationIds: [notMine] })
        ).rejects.toMatchObject({ statusCode: 404 });

        const ids = Array.from({ length: 6 }, (_, i) => `${i}`.repeat(24));

        await expect(
            forwardMessage({ messageId: message.id, userId: a.id, conversationIds: ids })
        ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("works over the socket and delivers to the new chat", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const c = await createUser("doctor");
        const source = await chatOf(a, b);
        const target = await chatOf(a, c);

        const { message } = await sendMessage({ conversationId: source, senderId: b.id, text: "forward me" });

        const sender = await openSocket(a.cookie);
        const receiver = await openSocket(c.cookie);

        const incoming = once(receiver, "chat:message");
        const ack = await ask(sender, "chat:forward", { messageId: message.id, conversationIds: [target] });
        const seen = await incoming;

        expect(ack.ok).toBe(true);
        expect(seen.forwarded).toBe(true);
        expect(seen.text).toBe("forward me");
    });
});

describe("file sharing", () => {
    it("saves an attachment as a file message with a caption", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const conversationId = await chatOf(a, b);

        const { message } = await sendAttachment({
            conversationId,
            senderId: a.id,
            attachment: fakeAttachment,
            caption: "  Look  "
        });

        const saved = await Message.findById(message.id).lean();

        expect(message.type).toBe("file");
        expect(message.text).toBe("Look");
        expect(toPublicMessage(saved).attachment).toEqual(fakeAttachment);
    });

    it("never accepts a file link from the socket", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const conversationId = await chatOf(a, b);
        const sender = await openSocket(a.cookie);

        const ack = await ask(sender, "chat:send", { conversationId, text: "", attachment: fakeAttachment });

        expect(ack.ok).toBe(false);
        expect(await Message.countDocuments({ conversation: conversationId, type: "file" })).toBe(0);
    });

    it("needs a login", async () => {
        const res = await request(app)
            .post("/chat/api/conversations/aaaaaaaaaaaaaaaaaaaaaaaa/attachments")
            .set("Accept", "application/json")
            .attach("file", PNG, { filename: "a.png", contentType: "image/png" });

        expect(res.status).toBe(401);
    });

    it("rejects file types that are not allowed", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const conversationId = await chatOf(a, b);

        const res = await request(app)
            .post(`/chat/api/conversations/${conversationId}/attachments`)
            .set("Accept", "application/json")
            .set("Cookie", a.cookie)
            .attach("file", Buffer.from("<svg onload=alert(1)>"), { filename: "x.svg", contentType: "image/svg+xml" });

        expect(res.status).toBe(400);
    });

    it("rejects a file whose content does not match its type", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const conversationId = await chatOf(a, b);

        const res = await request(app)
            .post(`/chat/api/conversations/${conversationId}/attachments`)
            .set("Accept", "application/json")
            .set("Cookie", a.cookie)
            .attach("file", Buffer.from("MZ not really a pdf"), { filename: "bill.pdf", contentType: "application/pdf" });

        expect(res.status).toBe(400);
    });

    it("hides other people's conversations from the upload route", async () => {
        const a = await createUser("farmer");
        const b = await createUser("buyer");
        const outsider = await createUser("user");
        const conversationId = await chatOf(a, b);

        const res = await request(app)
            .post(`/chat/api/conversations/${conversationId}/attachments`)
            .set("Accept", "application/json")
            .set("Cookie", outsider.cookie)
            .attach("file", PNG, { filename: "a.png", contentType: "image/png" });

        expect(res.status).toBe(404);
        expect(await Message.countDocuments({ conversation: conversationId, type: "file" })).toBe(0);
    });
});

describe("upload helpers", () => {
    it("recognises real files by their first bytes", () => {
        expect(contentMatchesType("image/png", PNG)).toBe(true);
        expect(contentMatchesType("image/jpeg", PNG)).toBe(false);
        expect(contentMatchesType("application/pdf", Buffer.from("%PDF-1.7"))).toBe(true);
        expect(contentMatchesType("application/pdf", Buffer.from("hello"))).toBe(false);
        expect(contentMatchesType("text/plain", Buffer.from([0x68, 0x00, 0x69]))).toBe(false);
        expect(contentMatchesType("image/svg+xml", Buffer.from("<svg>"))).toBe(false);
    });

    it("cleans file names", () => {
        expect(cleanFileName("../../etc/passwd", "text/plain")).toBe("passwd");
        expect(cleanFileName("a\u0000b<c>.pdf", "application/pdf")).toBe("abc.pdf");
        expect(cleanFileName("", "application/pdf")).toBe("file.pdf");
    });
});
