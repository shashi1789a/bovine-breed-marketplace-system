import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import indexRoutes from "./routes/index.routes.js";
import appRoutes from "./routes/app.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import breedRoutes from "./routes/breed.routes.js";
import googleAuthRoutes from "./routes/googleAuth.routes.js";
import { ApiError } from "./utils/ApiError.js";
import { wantsJson } from "./utils/session.js";

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set("trust proxy", 1);

app.use(
    cors({
        origin: process.env.CORS_ORIGIN,
        credentials: true
    })
);



app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/", indexRoutes);
app.use("/", appRoutes);
app.use("/breed", breedRoutes);
app.use("/payments", paymentRoutes);
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