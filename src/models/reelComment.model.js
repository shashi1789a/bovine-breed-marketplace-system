import mongoose, { Schema } from "mongoose";

export const MAX_COMMENT_LENGTH = 300;

const reelCommentSchema = new Schema(
    {
        reel: { type: Schema.Types.ObjectId, ref: "Reel", required: true },
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        text: { type: String, required: true, trim: true, minlength: 1, maxlength: MAX_COMMENT_LENGTH }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

reelCommentSchema.index({ reel: 1, _id: -1 });

export const ReelComment =
    mongoose.models.ReelComment || mongoose.model("ReelComment", reelCommentSchema);
