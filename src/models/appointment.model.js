import mongoose, { Schema } from "mongoose";

export const APPOINTMENT_STATUSES = Object.freeze(["pending", "confirmed", "declined", "cancelled", "completed"]);
export const ACTIVE_STATUSES = Object.freeze(["pending", "confirmed"]);

const appointmentSchema = new Schema(
    {
        patient: { type: Schema.Types.ObjectId, ref: "User", required: true },
        doctor: { type: Schema.Types.ObjectId, ref: "User", required: true },
        startsAt: { type: Date, required: true },
        durationMin: { type: Number, min: 5, max: 120, default: 20 },
        reason: { type: String, required: true, trim: true, maxlength: 400 },
        cattleLabel: { type: String, trim: true, maxlength: 80, default: "" },
        status: { type: String, enum: APPOINTMENT_STATUSES, default: "pending", index: true },
        doctorNote: { type: String, trim: true, maxlength: 600, default: "" },
        fee: { type: Number, min: 0, default: 0 },
        reminderSent: { type: Boolean, default: false }
    },
    { timestamps: true }
);

appointmentSchema.index(
    { doctor: 1, startsAt: 1 },
    { unique: true, partialFilterExpression: { status: { $in: ACTIVE_STATUSES } }, name: "one_active_booking_per_slot" }
);
appointmentSchema.index({ patient: 1, startsAt: -1 });
appointmentSchema.index({ doctor: 1, startsAt: -1 });
appointmentSchema.index({ status: 1, startsAt: 1, reminderSent: 1 });

export const Appointment = mongoose.models.Appointment || mongoose.model("Appointment", appointmentSchema);
