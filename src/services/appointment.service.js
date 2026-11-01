import { Appointment, ACTIVE_STATUSES } from "../models/appointment.model.js";
import { notifyMany } from "./notification.service.js";
import { addDays, dayKey, formatSlot, slotAt, weekdayOf } from "../utils/ist.js";

export const BOOKING_DAYS = 7;
export const MIN_LEAD_MS = 30 * 60 * 1000;
export const JOIN_EARLY_MS = 10 * 60 * 1000;
export const JOIN_LATE_MS = 45 * 60 * 1000;
const REMINDER_WINDOW_MS = 15 * 60 * 1000;

const toMinutes = (hhmm) => {
    const [hours, minutes] = hhmm.split(":").map(Number);

    return hours * 60 + minutes;
};

const toClock = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

export const doctorSettings = (doctor) => {
    const details = doctor.doctorDetails || {};

    return {
        from: details.availableFrom || "10:00",
        to: details.availableTo || "17:00",
        slotMinutes: details.slotMinutes || 20,
        workDays: Array.isArray(details.workDays) && details.workDays.length ? details.workDays : [1, 2, 3, 4, 5, 6],
        fee: details.consultationFee || 0,
        accepting: Boolean(details.acceptingBookings)
    };
};

export const openSlots = async (doctor, now = new Date()) => {
    const settings = doctorSettings(doctor);

    if (!settings.accepting) return [];

    const today = dayKey(now);
    const lastDay = addDays(today, BOOKING_DAYS);

    const booked = await Appointment.find({
        doctor: doctor._id,
        status: { $in: ACTIVE_STATUSES },
        startsAt: { $gte: slotAt(today, "00:00"), $lt: slotAt(lastDay, "00:00") }
    })
        .select("startsAt")
        .lean();

    const taken = new Set(booked.map((item) => item.startsAt.getTime()));
    const earliest = now.getTime() + MIN_LEAD_MS;
    const slots = [];

    for (let offset = 0; offset < BOOKING_DAYS; offset += 1) {
        const day = addDays(today, offset);

        if (!settings.workDays.includes(weekdayOf(day))) continue;

        const times = [];

        for (let minute = toMinutes(settings.from); minute + settings.slotMinutes <= toMinutes(settings.to); minute += settings.slotMinutes) {
            const startsAt = slotAt(day, toClock(minute));

            if (startsAt.getTime() >= earliest && !taken.has(startsAt.getTime())) {
                times.push({ iso: startsAt.toISOString(), label: startsAt.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" }) });
            }
        }

        if (times.length) slots.push({ day, times });
    }

    return slots;
};

export const canJoin = (appointment, now = Date.now()) => {
    if (appointment.status !== "confirmed") return false;

    const start = new Date(appointment.startsAt).getTime();

    return now >= start - JOIN_EARLY_MS && now <= start + JOIN_LATE_MS;
};

export const runAppointmentReminders = async () => {
    const now = new Date();

    const due = await Appointment.find({
        status: "confirmed",
        reminderSent: false,
        startsAt: { $gt: now, $lte: new Date(now.getTime() + REMINDER_WINDOW_MS) }
    })
        .limit(500)
        .lean();

    let sent = 0;

    for (const appointment of due) {
        const claimed = await Appointment.updateOne({ _id: appointment._id, reminderSent: false }, { $set: { reminderSent: true } });

        if (!claimed.modifiedCount) continue;

        await notifyMany([appointment.patient, appointment.doctor], {
            type: "appointment",
            title: `Consultation starts soon: ${formatSlot(appointment.startsAt)}`,
            body: "Open your appointments and tap Join video call.",
            link: "/appointments"
        });

        sent += 1;
    }

    return sent;
};
