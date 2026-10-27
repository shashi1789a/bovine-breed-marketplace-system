import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";

import indexRoutes from "./routes/index.routes.js";
import appRoutes from "./routes/app.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import breedRoutes from "./routes/breed.routes.js";
import googleAuthRoutes from "./routes/googleAuth.routes.js";
import { ApiError } from "./utils/ApiError.js";
import { wantsJson } from "./utils/session.js";
import { readAllowedOrigins } from "./sockets/socket.helpers.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);
app.disable("x-powered-by");

/* A short fingerprint of the chat script. It changes whenever the file does, so a phone or
   browser can never keep running an old copy after a deploy. */
const fingerprint = (file) => {
    try {
        return crypto
            .createHash("sha1")
            .update(fs.readFileSync(path.join(__dirname, "../public", file)))
            .digest("hex")
            .slice(0, 10);
    } catch {
        return String(Date.now());
    }
};

app.locals.chatClientVersion = fingerprint("assets/js/chat-client.js");
app.locals.reelsClientVersion = fingerprint("assets/js/reels.js");
app.locals.reelsCssVersion = fingerprint("assets/css/reels.css");

/* Gzip text responses when the optional "compression" package is installed. */
try {
    const { default: compression } = await import("compression");
    app.use(compression());
} catch {
    console.warn("[app] 'compression' is not installed, responses are sent uncompressed");
}

/* Basic hardening headers. No CSP on purpose: the pages use inline scripts and CDNs. */
app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=()");

    if (process.env.NODE_ENV === "production") {
        res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
    }

    next();
});

/* Only the sites listed in CORS_ORIGIN may call the API from a browser. Same-site pages need no CORS. */
const allowedOrigins = readAllowedOrigins();

app.use(
    cors({
        origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
        credentials: true
    })
);

/* Razorpay signs the raw request body, so this must run before express.json() reads it. */
app.use("/payments", paymentRoutes);



app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(
    express.static(path.join(__dirname, "../public"), {
        setHeaders: (res, filePath) => {
            /* Pictures and fonts rarely change. Scripts and styles are re-checked with an ETag. */
            if (/\.(png|jpe?g|webp|gif|svg|ico|woff2?)$/i.test(filePath)) {
                res.setHeader("Cache-Control", "public, max-age=604800");
            } else {
                res.setHeader("Cache-Control", "no-cache");
            }
        }
    })
);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use((req, res, next) => {
  res.locals.user = (req.session && req.session.user) || req.user || null;
  next();
});

app.use("/", indexRoutes);
app.use("/", appRoutes);
app.use("/breed", breedRoutes);
app.use("/auth", googleAuthRoutes);
app.use((req, res) => {
    if (wantsJson(req)) {
        return res.status(404).json({ success: false, message: "Not found" });
    }

    return res.status(404).render("404", { title: "Page Not Found", user: req.user });
});

app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);

    const isMulterError = err?.name === "MulterError";
    const status = isMulterError ? 400 : err.statusCode || 500;
    const message =
        err instanceof ApiError || isMulterError ? err.message : "Something went wrong";

    if (status >= 500) console.error(err);

    if (wantsJson(req)) {
        return res.status(status).json({ success: false, message });
    }

    return res.status(status).render("error", {
        title: "Something went wrong",
        user: req.user,
        status,
        message
    });
});

export { app };