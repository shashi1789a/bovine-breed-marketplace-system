import { Router } from "express";

import userRoutes from "./user.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import adminRoutes from "./admin.routes.js";
import { farmerRouter, doctorRouter, sellerRouter } from "./seller.routes.js";
import productRoutes from "./product.routes.js";
import cattleRoutes from "./cattle.routes.js";
import chatRoutes from "./chat.routes.js";
import reelRoutes from "./reel.routes.js";
import farmerProfileRoutes from "./farmerProfile.routes.js";
import wishlistRoutes from "./wishlist.routes.js";
import notificationRoutes from "./notification.routes.js";
import offerRoutes from "./offer.routes.js";
import verificationRoutes from "./verification.routes.js";
import preferencesRoutes from "./preferences.routes.js";
import dairyRoutes from "./dairy.routes.js";
import reminderRoutes from "./reminder.routes.js";
import breedRoutes from "./breed.routes.js";
import { doctorsRouter, appointmentsRouter, availabilityRouter } from "./appointment.routes.js";

const HIDDEN_LOCALS = new Set(["t", "lang", "settings", "_locals", "cache"]);

const plain = (value) => {
    const seen = new WeakSet();

    return JSON.parse(
        JSON.stringify(value, (key, item) => {
            if (typeof item === "function") return undefined;

            if (item && typeof item === "object") {
                if (seen.has(item)) return undefined;
                seen.add(item);
            }

            return typeof item === "bigint" ? String(item) : item;
        })
    );
};

const bridgeResponses = (req, res, next) => {
    req.headers.accept = "application/json";
    res.set("Cache-Control", "no-store");

    res.render = (view, options, callback) => {
        const locals = typeof options === "function" ? {} : options || {};
        const merged = { ...res.locals, ...locals };

        for (const key of HIDDEN_LOCALS) delete merged[key];

        const status = res.statusCode || 200;
        const body = {
            statusCode: status,
            success: status < 400,
            message: status < 400 ? "OK" : String(merged.error || merged.message || merged.title || "Request failed"),
            data: { view, ...plain(merged) }
        };

        const done = typeof options === "function" ? options : callback;

        if (typeof done === "function") done(null, JSON.stringify(body));

        return res.status(status).json(body);
    };

    res.redirect = (first, second) => {
        const target = typeof first === "number" ? second : first;
        const status = res.statusCode >= 400 ? res.statusCode : 200;
        let message = "";
        let kind = "success";

        try {
            const url = new URL(String(target), "http://local");
            message = url.searchParams.get("success") || url.searchParams.get("error") || "";
            if (url.searchParams.get("error")) kind = "error";
        } catch {
            message = "";
        }

        return res.status(status).json({
            statusCode: status,
            success: kind === "success",
            message: message || "Done",
            data: { redirect: String(target), kind, message: message || "Done" }
        });
    };

    next();
};

const bridge = Router();

bridge.use(bridgeResponses);

bridge.use("/breed", breedRoutes);
bridge.use("/admin", adminRoutes);
bridge.use("/farmer/dairy", dairyRoutes);
bridge.use("/farmer/reminders", reminderRoutes);
bridge.use("/farmer", farmerRouter);
bridge.use("/doctor/availability", availabilityRouter);
bridge.use("/doctor", doctorRouter);
bridge.use("/seller", sellerRouter);
bridge.use("/products", productRoutes);
bridge.use("/cattle", cattleRoutes);
bridge.use("/chat", chatRoutes);
bridge.use("/reels", reelRoutes);
bridge.use("/farmers", farmerProfileRoutes);
bridge.use("/wishlist", wishlistRoutes);
bridge.use("/notifications", notificationRoutes);
bridge.use("/offers", offerRoutes);
bridge.use("/verification", verificationRoutes);
bridge.use("/account", preferencesRoutes);
bridge.use("/doctors", doctorsRouter);
bridge.use("/appointments", appointmentsRouter);
bridge.use("/", dashboardRoutes);
bridge.use("/", userRoutes);

export default bridge;
