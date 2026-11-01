import { Reminder, REMINDER_KINDS } from "../models/reminder.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, readFlash, reject, respond } from "../utils/http.js";
import { addDays, dayKey, daysBetween, isDayKey } from "../utils/ist.js";

const HOME = "/farmer/reminders";
const MAX_OPEN = 300;
const COW_DAYS = 283;
const BUFFALO_DAYS = 310;
const PREGNANCY_CHECK_DAYS = 60;

const FAR_FUTURE = 365 * 3;

const intIn = (value, min, max, fallback) => {
    const parsed = Number.parseInt(value, 10);

    if (!Number.isFinite(parsed)) return fallback;

    return Math.min(Math.max(parsed, min), max);
};

const futureDay = (value) => {
    const day = String(value || "");
    const today = dayKey();

    if (!isDayKey(day) || day < addDays(today, -30) || day > addDays(today, FAR_FUTURE)) return null;

    return day;
};

const decorate = (reminder, today) => {
    const distance = daysBetween(today, reminder.dueDay);

    return {
        ...reminder,
        distance,
        state: reminder.done ? "done" : distance < 0 ? "overdue" : distance === 0 ? "today" : distance <= reminder.leadDays ? "soon" : "later"
    };
};

export const showReminders = asyncHandler(async (req, res) => {
    const today = dayKey();
    const tab = req.query.tab === "done" ? "done" : "open";

    const reminders = await Reminder.find({ user: req.user._id, done: tab === "done" })
        .sort(tab === "done" ? { doneAt: -1 } : { dueDay: 1 })
        .limit(150)
        .lean();

    return res.status(200).render("reminders/index", {
        title: "Vaccination & Breeding Reminders | BoviNetra",
        user: req.user,
        tab,
        today,
        reminders: reminders.map((item) => decorate(item, today)),
        kinds: REMINDER_KINDS,
        cowDays: COW_DAYS,
        buffaloDays: BUFFALO_DAYS,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const ensureRoom = async (userId, adding) => {
    const open = await Reminder.countDocuments({ user: userId, done: false });

    return open + adding <= MAX_OPEN;
};

export const createReminder = asyncHandler(async (req, res) => {
    const kind = REMINDER_KINDS.includes(req.body?.kind) ? req.body.kind : "other";
    const title = queryString(req.body?.title, 100);
    const dueDay = futureDay(req.body?.dueDay);

    if (!title) return reject(req, res, { message: "Enter what the reminder is for", redirectTo: HOME });
    if (!dueDay) return reject(req, res, { message: "Choose a valid due date", redirectTo: HOME });
    if (!(await ensureRoom(req.user._id, 1))) return reject(req, res, { message: "Too many open reminders. Finish some first.", redirectTo: HOME });

    await Reminder.create({
        user: req.user._id,
        kind,
        title,
        dueDay,
        cattleLabel: queryString(req.body?.cattleLabel, 80),
        leadDays: intIn(req.body?.leadDays, 0, 30, 3),
        repeatDays: intIn(req.body?.repeatDays, 0, 730, 0),
        notes: queryString(req.body?.notes, 300)
    });

    return respond(req, res, { redirectTo: HOME, message: "Reminder added" });
});

export const createBreeding = asyncHandler(async (req, res) => {
    const serviceDay = futureDay(req.body?.serviceDay);
    const species = req.body?.species === "buffalo" ? "buffalo" : "cow";
    const label = queryString(req.body?.cattleLabel, 80);

    if (!serviceDay || serviceDay > dayKey()) {
        return reject(req, res, { message: "Enter the insemination or mating date (today or earlier)", redirectTo: HOME });
    }

    if (!(await ensureRoom(req.user._id, 2))) return reject(req, res, { message: "Too many open reminders. Finish some first.", redirectTo: HOME });

    const calvingDay = addDays(serviceDay, species === "buffalo" ? BUFFALO_DAYS : COW_DAYS);

    await Reminder.insertMany([
        { user: req.user._id, kind: "pregnancy_check", title: "Pregnancy check", cattleLabel: label, dueDay: addDays(serviceDay, PREGNANCY_CHECK_DAYS), leadDays: 2, notes: `Served on ${serviceDay}` },
        { user: req.user._id, kind: "calving", title: "Expected calving", cattleLabel: label, dueDay: calvingDay, leadDays: 7, notes: `Served on ${serviceDay}. Keep the dry cow on good feed and a clean calving area.` }
    ]);

    return respond(req, res, { redirectTo: HOME, message: `Added pregnancy check and calving date (${calvingDay})` });
});

export const completeReminder = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) return reject(req, res, { status: 404, message: "Reminder not found", redirectTo: HOME });

    const reminder = await Reminder.findOneAndUpdate(
        { _id: req.params.id, user: req.user._id, done: false },
        { $set: { done: true, doneAt: new Date() } },
        { new: true }
    );

    if (!reminder) return reject(req, res, { status: 404, message: "Reminder not found", redirectTo: HOME });

    if (reminder.repeatDays > 0 && (await ensureRoom(req.user._id, 1))) {
        await Reminder.create({
            user: reminder.user,
            kind: reminder.kind,
            title: reminder.title,
            cattleLabel: reminder.cattleLabel,
            dueDay: addDays(dayKey(), reminder.repeatDays),
            leadDays: reminder.leadDays,
            repeatDays: reminder.repeatDays,
            notes: reminder.notes
        });
    }

    return respond(req, res, {
        redirectTo: HOME,
        message: reminder.repeatDays > 0 ? "Done. Next reminder scheduled." : "Marked as done"
    });
});

export const deleteReminder = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) return reject(req, res, { status: 404, message: "Reminder not found", redirectTo: HOME });

    const removed = await Reminder.deleteOne({ _id: req.params.id, user: req.user._id });

    if (!removed.deletedCount) return reject(req, res, { status: 404, message: "Reminder not found", redirectTo: HOME });

    return respond(req, res, { redirectTo: HOME, message: "Reminder deleted" });
});
