import mongoose, { Schema } from "mongoose";

import { MAX_CAPTION_LENGTH, MAX_REEL_SECONDS } from "../utils/reel.helpers.js";

const reelSchema = new Schema(
    {
        cattle: { type: Schema.Types.ObjectId, ref: "Cattle", required: true, index: true },
        farmer: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

        videoUrl: { type: String, required: true, trim: true, maxlength: 600 },
        publicId: { type: String, required: true, trim: true, maxlength: 300 },

        durationSec: { type: Number, required: true, min: 0, max: MAX_REEL_SECONDS + 1 },
        sizeBytes: { type: Number, min: 0 },

        caption: { type: String, trim: true, maxlength: MAX_CAPTION_LENGTH, default: "" },

        isActive: { type: Boolean, default: true }
    },
    { timestamps: true }
);

/* Newest first, per farmer or per cattle. */
reelSchema.index({ isActive: 1, _id: -1 });
reelSchema.index({ farmer: 1, _id: -1 });

export const Reel = mongoose.models.Reel || mongoose.model("Reel", reelSchema);
