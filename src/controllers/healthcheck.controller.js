import mongoose from "mongoose";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

/* Booleans only. Never put a secret or its value in this response. */
const readiness = () => ({
    cloudinary: Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
    ),
    corsOriginSet: Boolean(process.env.CORS_ORIGIN),
    turnConfigured: Boolean(process.env.TURN_URLS),
    production: process.env.NODE_ENV === "production"
});

const healthcheck = asyncHandler(async (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                db: dbState,
                /* If this is missing, Render is still running an old deploy. */
                chatFeatures: ["reply", "forward", "attachments", "camera-switch"],
                chatClientVersion: req.app.locals.chatClientVersion,
                ...readiness()
            },
            "OK"
        )
    );
});

export { healthcheck };
