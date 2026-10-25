import mongoose, { Schema } from "mongoose";

export const MAX_MESSAGE_LENGTH = 2000;
export const CALL_OUTCOMES = Object.freeze(["ended", "missed", "declined"]);

const callSchema = new Schema(
    {
        outcome: { type: String, enum: CALL_OUTCOMES, required: true },
        durationSec: { type: Number, min: 0, default: 0 }
    },
    { _id: false }
);

const messageSchema = new Schema(
    {
        conversation: {
            type: Schema.Types.ObjectId,
            ref: "Conversation",
            required: true
        },

        sender: { type: Schema.Types.ObjectId, ref: "User", required: true },

        type: { type: String, enum: ["text", "call"], default: "text" },

        text: {
            type: String,
            trim: true,
            maxlength: [MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`],
            required: function () {
                return this.type === "text";
            }
        },

        call: { type: callSchema, default: undefined }
    },
    { timestamps: true }
);

messageSchema.index({ conversation: 1, _id: -1 });

export const Message = mongoose.model("Message", messageSchema);
