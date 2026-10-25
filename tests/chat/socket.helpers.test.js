import crypto from "node:crypto";

import {
    buildIceServers,
    createRateLimiter,
    isAllowedOrigin,
    parseCookies,
    readAllowedOrigins
} from "../../src/sockets/socket.helpers.js";

describe("parseCookies", () => {
    it("reads several cookies", () => {
        expect(parseCookies("accessToken=abc; theme=dark")).toEqual({
            accessToken: "abc",
            theme: "dark"
        });
    });

    it("decodes values and strips quotes", () => {
        expect(parseCookies('a=hello%20world; b="quoted"')).toEqual({ a: "hello world", b: "quoted" });
    });

    it("keeps '=' signs inside values (JWTs and base64)", () => {
        expect(parseCookies("t=aaa.bbb.ccc=="))
            .toEqual({ t: "aaa.bbb.ccc==" });
    });

    it("never throws on broken input", () => {
        expect(parseCookies("")).toEqual({});
        expect(parseCookies(undefined)).toEqual({});
        expect(parseCookies("novalue; =x; ok=1")).toEqual({ ok: "1" });
        expect(parseCookies("bad=%E0%A4%A").bad).toBe("%E0%A4%A");
    });
});

describe("origin checks (cross-site WebSocket protection)", () => {
    it("reads and cleans the allowed origin list", () => {
        expect(readAllowedOrigins("https://a.com/, https://b.com ,*,")).toEqual([
            "https://a.com",
            "https://b.com"
        ]);
        expect(readAllowedOrigins("")).toEqual([]);
    });

    it("allows requests without an Origin header (not a browser)", () => {
        expect(isAllowedOrigin(undefined, "site.com", [])).toBe(true);
    });

    it("allows the site's own origin", () => {
        expect(isAllowedOrigin("https://bovinetra.in", "bovinetra.in", [])).toBe(true);
        expect(isAllowedOrigin("http://localhost:8000", "localhost:8000", [])).toBe(true);
    });

    it("allows origins listed in CORS_ORIGIN", () => {
        expect(isAllowedOrigin("https://www.bovinetra.in", "api.bovinetra.in", ["https://www.bovinetra.in"])).toBe(true);
    });

    it("blocks everything else", () => {
        expect(isAllowedOrigin("https://evil.example", "bovinetra.in", [])).toBe(false);
        expect(isAllowedOrigin("https://bovinetra.in.evil.example", "bovinetra.in", [])).toBe(false);
        expect(isAllowedOrigin("null", "bovinetra.in", [])).toBe(false);
        expect(isAllowedOrigin("not a url", "bovinetra.in", [])).toBe(false);
    });
});

describe("rate limiter", () => {
    const makeLimiter = () => {
        let time = 0;
        const limiter = createRateLimiter({ limit: 3, windowMs: 1000, now: () => time });

        return { limiter, advance: (ms) => (time += ms) };
    };

    it("allows up to the limit and then blocks", () => {
        const { limiter } = makeLimiter();

        expect(limiter.allow("u1")).toBe(true);
        expect(limiter.allow("u1")).toBe(true);
        expect(limiter.allow("u1")).toBe(true);
        expect(limiter.allow("u1")).toBe(false);
    });

    it("tracks each user separately", () => {
        const { limiter } = makeLimiter();

        for (let i = 0; i < 3; i++) limiter.allow("u1");

        expect(limiter.allow("u1")).toBe(false);
        expect(limiter.allow("u2")).toBe(true);
    });

    it("lets people back in after the window passes", () => {
        const { limiter, advance } = makeLimiter();

        for (let i = 0; i < 3; i++) limiter.allow("u1");
        expect(limiter.allow("u1")).toBe(false);

        advance(1000);

        expect(limiter.allow("u1")).toBe(true);
    });

    it("can be reset", () => {
        const { limiter } = makeLimiter();

        for (let i = 0; i < 3; i++) limiter.allow("u1");
        limiter.reset("u1");

        expect(limiter.allow("u1")).toBe(true);
    });
});

describe("ICE server configuration", () => {
    it("falls back to a public STUN server", () => {
        const servers = buildIceServers({ userId: "u1", env: {} });

        expect(servers).toEqual([{ urls: ["stun:stun.l.google.com:19302"] }]);
    });

    it("uses configured STUN servers", () => {
        const servers = buildIceServers({ userId: "u1", env: { STUN_URLS: "stun:a:3478, stun:b:3478" } });

        expect(servers[0].urls).toEqual(["stun:a:3478", "stun:b:3478"]);
    });

    it("creates short-lived TURN credentials from a shared secret (coturn)", () => {
        const now = 1_700_000_000_000;
        const servers = buildIceServers({
            userId: "u42",
            now,
            env: { TURN_URLS: "turn:turn.example.com:3478", TURN_SECRET: "s3cret", TURN_TTL_SECONDS: "600" }
        });

        const turn = servers[1];
        const expectedUser = `${Math.floor(now / 1000) + 600}:u42`;
        const expectedPass = crypto.createHmac("sha1", "s3cret").update(expectedUser).digest("base64");

        expect(turn.urls).toEqual(["turn:turn.example.com:3478"]);
        expect(turn.username).toBe(expectedUser);
        expect(turn.credential).toBe(expectedPass);
    });

    it("supports a fixed TURN username and password", () => {
        const servers = buildIceServers({
            userId: "u1",
            env: { TURN_URLS: "turn:t:3478", TURN_USERNAME: "user", TURN_CREDENTIAL: "pass" }
        });

        expect(servers[1].username).toBe("user");
        expect(servers[1].credential).toBe("pass");
    });

    it("never advertises TURN without credentials", () => {
        const servers = buildIceServers({ userId: "u1", env: { TURN_URLS: "turn:t:3478" } });

        expect(servers).toHaveLength(1);
    });
});
