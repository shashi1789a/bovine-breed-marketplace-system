import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import indexRoutes from "./routes/index.routes.js";
import appRoutes from "./routes/app.routes.js";
import paymentRoutes from "./routes/payment.routes.js";
import breedRoutes from "./routes/breed.routes.js";

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

app.use("/payments", paymentRoutes);
app.use("/", indexRoutes);
app.use("/", appRoutes);
app.use("/breed", breedRoutes);

app.use((err, req, res, next) => {
    console.error(err);   // 👈 ye line add karo
    
    const status = err.statusCode || 500;

    if (req.accepts(["html", "json"]) === "json" || req.header("Authorization")) {
        return res.status(status).json({
            success: false,
            message: status === 500 ? "Something went wrong" : err.message
        });
    }

    return res.status(status).render("error", {
        title: "Something went wrong",
        status,
        message: status === 500 ? "Something went wrong" : err.message
    });
});

export { app };