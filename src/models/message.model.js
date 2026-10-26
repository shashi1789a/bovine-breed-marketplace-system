import mongoose, { Schema } from "mongoose";

export const MAX_MESSAGE_LENGTH = 2000;
export const CALL_OUTCOMES = Object.freeze(["ended", "missed", "declined"]);
export const MESSAGE_TYPES = Object.freeze(["text", "call", "file"]);
export const ATTACHMENT_KINDS = Object.freeze(["image", "file"]);

const callSchema = new Schema(
    {
        outcome: { type: String, enum: CALL_OUTCOMES, required: true },
        durationSec: { type: Number, min: 0, default: 0 }
    },
    { _id: false }
);

/* A shared image or document. The file itself lives on Cloudinary. */
const attachmentSchema = new Schema(
    {
        url: { type: String, required: true, trim: true, maxlength: 600 },
        name: { type: String, required: true, trim: true, maxlength: 160 },
        mimeType: { type: String, required: true, trim: true, maxlength: 120 },
        size: { type: Number, min: 0, default: 0 },
        kind: { type: String, enum: ATTACHMENT_KINDS, default: "file" }
    },
    { _id: false }
);

/*
 * A short copy of the message being answered. A copy (not a reference) keeps
 * the quote readable even when the original is far back in the history.
 */
const replySchema = new Schema(
    {
        messageId: { type: Schema.Types.ObjectId, ref: "Message", required: true },
        senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
        type: { type: String, enum: ["text", "file"], default: "text" },
        text: { type: String, default: "", maxlength: 200 },
        attachmentName: { type: String, default: "", maxlength: 160 },
        attachmentKind: { type: String, enum: [...ATTACHMENT_KINDS, ""], default: "" }
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

        type: { type: String, enum: MESSAGE_TYPES, default: "text" },

        /* For a "file" message the text is an optional caption. */
        text: {
            type: String,
            trim: true,
            maxlength: [MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`],
            required: function () {
                return this.type === "text";
            }
        },

        call: { type: callSchema, default: undefined },

        attachment: {
            type: attachmentSchema,
            default: undefined,
            required: function () {
                return this.type === "file";
            }
        },

        replyTo: { type: replySchema, default: undefined },

        forwarded: { type: Boolean, default: false }
    },
    { timestamps: true }
);

messageSchema.index({ conversation: 1, _id: -1 });

export const Message = mongoose.model("Message", messageSchema);
