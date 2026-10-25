import mongoose, { Schema } from "mongoose";

/* One document per pair of users, whatever their roles. */
export const makePairKey = (firstId, secondId) =>
    [String(firstId), String(secondId)].sort().join(":");

const lastMessageSchema = new Schema(
    {
        text: { type: String, default: "" },
        type: { type: String, enum: ["text", "call"], default: "text" },
        sender: { type: Schema.Types.ObjectId, ref: "User" },
        at: Date
    },
    { _id: false }
);

const conversationSchema = new Schema(
    {
        participants: {
            type: [{ type: Schema.Types.ObjectId, ref: "User" }],
            validate: {
                validator: (value) => Array.isArray(value) && value.length === 2,
                message: "A conversation needs exactly two participants"
            }
        },

        pairKey: { type: String, required: true, unique: true },

        lastMessage: { type: lastMessageSchema, default: undefined },

        /* unread count per user id: { "<userId>": 3 } */
        unread: { type: Map, of: Number }
    },
    { timestamps: true }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

export const Conversation = mongoose.model("Conversation", conversationSchema);
