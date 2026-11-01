import mongoose, { Schema } from "mongoose";

export const REMINDER_KINDS = Object.freeze(["vaccination", "deworming", "pregnancy_check", "calving", "heat", "checkup", "other"]);

const reminderSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        kind: { type: String, enum: REMINDER_KINDS, required: true },
        title: { type: String, required: true, trim: true, maxlength: 100 },
        cattleLabel: { type: String, trim: true, maxlength: 80, default: "" },
        dueDay: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        leadDays: { type: Number, min: 0, max: 30, default: 3 },
        repeatDays: { type: Number, min: 0, max: 730, default: 0 },
        notes: { type: String, trim: true, maxlength: 300, default: "" },
        done: { type: Boolean, default: false },
        doneAt: { type: Date, default: null },
        notifiedDay: { type: String, default: "" }
    },
    { timestamps: true }
);

reminderSchema.index({ user: 1, done: 1, dueDay: 1 });
reminderSchema.index({ done: 1, dueDay: 1 });

export const Reminder = mongoose.models.Reminder || mongoose.model("Reminder", reminderSchema);
