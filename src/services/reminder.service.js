import { Reminder } from "../models/reminder.model.js";
import { notify } from "./notification.service.js";
import { addDays, dayKey, daysBetween } from "../utils/ist.js";

const OVERDUE_NUDGE_DAYS = 3;
const MAX_PER_RUN = 2000;

const messageFor = (reminder, distance) => {
    const who = reminder.cattleLabel ? ` for ${reminder.cattleLabel}` : "";

    if (distance > 0) {
        return { title: `${reminder.title}${who} is due in ${distance} day${distance === 1 ? "" : "s"}`, body: reminder.notes };
    }

    if (distance === 0) return { title: `${reminder.title}${who} is due today`, body: reminder.notes };

    return { title: `${reminder.title}${who} is overdue by ${-distance} days`, body: "Mark it done once finished." };
};

export const runDueReminders = async () => {
    const today = dayKey();

    const candidates = await Reminder.find({
        done: false,
        dueDay: { $gte: addDays(today, -OVERDUE_NUDGE_DAYS), $lte: addDays(today, 30) },
        notifiedDay: { $ne: today }
    })
        .limit(MAX_PER_RUN)
        .lean();

    let sent = 0;

    for (const reminder of candidates) {
        const distance = daysBetween(today, reminder.dueDay);
        const matches = distance === reminder.leadDays || distance === 0 || distance === -OVERDUE_NUDGE_DAYS;

        if (!matches) continue;

        const claimed = await Reminder.updateOne(
            { _id: reminder._id, done: false, notifiedDay: { $ne: today } },
            { $set: { notifiedDay: today } }
        );

        if (!claimed.modifiedCount) continue;

        await notify(reminder.user, {
            type: "reminder",
            ...messageFor(reminder, distance),
            link: "/farmer/reminders"
        });

        sent += 1;
    }

    return sent;
};
