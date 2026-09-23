import mongoose from "mongoose";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const healthcheck = asyncHandler(async (req, res) => {
    const dbState = mongoose.connection.readyState === 1 ? "connected" : "disconnected";

    return res
        .status(200)
        .json(new ApiResponse(200, { db: dbState }, "OK"));
});

export { healthcheck };