/*
 * End-to-end check with two real Chromium browsers and a real WebRTC connection.
 * Chromium's fake camera/microphone flags replace the physical devices.
 *
 *   npm i -D playwright mongodb-memory-server
 *   npx playwright install chromium
 *   node tests/e2e/video-call.e2e.mjs
 *
 * Add HEADED=1 to watch it run.
 */
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";

import { createUser, startTestDb, stopTestDb } from "../chat/helpers/env.js";

const log = (message) => console.log(`✓ ${message}`);

const mongod = await startTestDb();
const { app } = await import("../../src/app.js");
const { initSocket } = await import("../../src/sockets/index.js");

const server = http.createServer(app);
const io = initSocket(server, { ringTimeoutMs: 30000 });

await new Promise((resolve) => server.listen(0, resolve));

const base = `http://localhost:${server.address().port}`;
const farmer = await createUser("farmer", { fullName: "Asha Farmer" });
const doctor = await createUser("doctor", { fullName: "Dr Ravi" });

const browser = await chromium.launch({
    headless: !process.env.HEADED,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
});

const newPage = async (who) => {
    const context = await browser.newContext({ permissions: ["camera", "microphone"] });
    await context.addCookies([{ name: "accessToken", value: who.cookie.split("=")[1], url: base }]);

    const page = await context.newPage();
    page.on("pageerror", (error) => assert.fail(`Browser error: ${error.message}`));

    return page;
};

let exitCode = 0;

try {
    const asha = await newPage(farmer);
    const ravi = await newPage(doctor);

    /* ---- chat ---- */
    await asha.goto(`${base}/chat?with=${doctor.id}`);
    await ravi.goto(`${base}/chat`);
    await asha.waitForSelector("#thread:not([hidden])");
    log("farmer opened a conversation with the doctor");

    await asha.fill("#messageInput", "Namaste doctor, my cow is limping");
    await asha.press("#messageInput", "Enter");
    await ravi.waitForSelector("#conversationList >> text=my cow is limping");
    log("doctor received the message live");

    /* ---- video call ---- */
    await asha.click("#callBtn");
    await ravi.waitForSelector("#incomingCall:not([hidden])");
    assert.match(await ravi.textContent("#incomingName"), /Asha Farmer/);
    log("doctor's phone rings with the caller's name");

    await ravi.click("#incomingAccept");

    const hasVideo = (page) =>
        page.waitForFunction(
            () => {
                const video = document.getElementById("remoteVideo");
                return video && video.videoWidth > 0 && !video.paused;
            },
            null,
            { timeout: 20000 }
        );

    await Promise.all([hasVideo(asha), hasVideo(ravi)]);
    log("both sides are receiving live video");

    await asha.click("#micBtn");
    assert.equal(await asha.getAttribute("#micBtn", "aria-pressed"), "true");
    log("microphone mute toggles");

    await asha.click("#hangupBtn");
    await ravi.waitForSelector("#callOverlay", { state: "hidden" });
    log("hang up closes the call for the other person");

    await ravi.click("#conversationList button");
    await ravi.waitForSelector(".call-log");
    log("the call is saved in the chat history");

    console.log("\nAll end-to-end checks passed.");
} catch (error) {
    console.error("\n✗ E2E failed:", error.message);
    exitCode = 1;
} finally {
    await browser.close();
    await new Promise((resolve) => io.close(resolve));
    await stopTestDb(mongod);
    process.exit(exitCode);
}
