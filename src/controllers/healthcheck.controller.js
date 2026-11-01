import mongoose from "mongoose";

import { monitoringEnabled } from "../utils/monitoring.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const readiness = () => ({
    cloudinary: Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
    ),
    corsOriginSet: Boolean(process.env.CORS_ORIGIN),
    turnConfigured: Boolean(process.env.TURN_URLS),
    production: process.env.NODE_ENV === "production",
    monitoring: monitoringEnabled(),
    pushConfigured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
});

const healthcheck = asyncHandler(async (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                db: dbState,
                chatFeatures: ["reply", "forward", "attachments", "camera-switch"],
                chatClientVersion: req.app.locals.chatClientVersion,
                ...readiness()
            },
            "OK"
        )
    );
});

export { healthcheck };
