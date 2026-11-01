import mongoose, { Schema } from "mongoose";

const reelLikeSchema = new Schema(
    {
        reel: { type: Schema.Types.ObjectId, ref: "Reel", required: true },
        user: { type: Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

reelLikeSchema.index({ reel: 1, user: 1 }, { unique: true });
reelLikeSchema.index({ user: 1, reel: 1 });

export const ReelLike = mongoose.models.ReelLike || mongoose.model("ReelLike", reelLikeSchema);
