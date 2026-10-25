import crypto from "node:crypto";

/* Small, dependency-free helpers used by the socket layer. */

export const parseCookies = (header = "") => {
    const cookies = {};

    for (const rawPart of String(header).split(";")) {
        const part = rawPart.trim();
        const index = part.indexOf("=");
        if (index < 1) continue;

        const name = part.slice(0, index).trim();
        let value = part.slice(index + 1).trim();

        if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
        }

        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }
    }

    return cookies;
};

export const readAllowedOrigins = (raw = process.env.CORS_ORIGIN) =>
    String(raw || "")
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter((origin) => origin && origin !== "*");

/*
 * Cookies authenticate the socket, so a page on another site must not be able
 * to open one (cross-site WebSocket hijacking). Browsers always send Origin on
 * a WebSocket handshake; requests without it are not browsers.
 */
export const isAllowedOrigin = (origin, host, allowedOrigins = []) => {
    if (!origin) return true;

    let parsed;

    try {
        parsed = new URL(origin);
    } catch {
        return false;
    }

    if (host && parsed.host === host) return true;

    return allowedOrigins.includes(parsed.origin);
};

export const createRateLimiter = ({ limit, windowMs, now = Date.now }) => {
    const hits = new Map();

    const sweep = (time) => {
        for (const [key, stamps] of hits) {
            if (stamps.every((stamp) => time - stamp >= windowMs)) hits.delete(key);
        }
    };

    return {
        allow(key) {
            const time = now();

            if (hits.size > 10000) sweep(time);

            const recent = (hits.get(key) || []).filter((stamp) => time - stamp < windowMs);

            if (recent.length >= limit) {
                hits.set(key, recent);
                return false;
            }

            recent.push(time);
            hits.set(key, recent);

            return true;
        },
        reset(key) {
            if (key === undefined) hits.clear();
            else hits.delete(key);
        }
    };
};

const splitList = (value) =>
    String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

/*
 * STUN finds a public address. TURN relays media when two phones are behind
 * strict NATs (very common on mobile networks), so production needs TURN.
 * With TURN_SECRET the credentials are short-lived (coturn "use-auth-secret").
 */
export const buildIceServers = ({ userId, env = process.env, now = Date.now() } = {}) => {
    const stunUrls = splitList(env.STUN_URLS);
    const servers = [{ urls: stunUrls.length ? stunUrls : ["stun:stun.l.google.com:19302"] }];
    const turnUrls = splitList(env.TURN_URLS);

    if (!turnUrls.length) return servers;

    if (env.TURN_SECRET) {
        const ttl = Number(env.TURN_TTL_SECONDS) || 3600;
        const username = `${Math.floor(now / 1000) + ttl}:${userId}`;
        const credential = crypto
            .createHmac("sha1", env.TURN_SECRET)
            .update(username)
            .digest("base64");

        servers.push({ urls: turnUrls, username, credential });
    } else if (env.TURN_USERNAME && env.TURN_CREDENTIAL) {
        servers.push({
            urls: turnUrls,
            username: env.TURN_USERNAME,
            credential: env.TURN_CREDENTIAL
        });
    }

    return servers;
};
