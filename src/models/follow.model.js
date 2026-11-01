import mongoose, { Schema } from "mongoose";

export const MAX_FOLLOWING = 500;

const followSchema = new Schema(
    {
        follower: { type: Schema.Types.ObjectId, ref: "User", required: true },
        farmer: { type: Schema.Types.ObjectId, ref: "User", required: true }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

followSchema.index({ follower: 1, farmer: 1 }, { unique: true });
followSchema.index({ farmer: 1, follower: 1 });

export const Follow = mongoose.models.Follow || mongoose.model("Follow", followSchema);
