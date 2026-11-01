import { DairyEntry, EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../models/dairyEntry.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, readFlash, reject, respond } from "../utils/http.js";
import { addDays, dayKey, isDayKey, MONTH_PATTERN, monthDays, monthKey, shiftMonth } from "../utils/ist.js";

const HOME = "/farmer/dairy";
const BACK_DAYS = 400;

const number = (value, min, max) => {
    if (value === undefined || value === null || String(value).trim() === "") return 0;

    const parsed = Number(value);

    if (!Number.isFinite(parsed) || parsed < min || parsed > max) return NaN;

    return Math.round(parsed * 100) / 100;
};

const validDay = (value) => {
    const day = value ? String(value) : dayKey();
    const today = dayKey();

    if (!isDayKey(day) || day > today || day < addDays(today, -BACK_DAYS)) return null;

    return day;
};

const round = (value) => Math.round(value * 100) / 100;

export const showDairy = asyncHandler(async (req, res) => {
    const requested = String(req.query.month || "");
    const current = monthKey();
    const month = MONTH_PATTERN.test(requested) && requested <= current ? requested : current;
    const days = monthDays(month);

    const entries = await DairyEntry.find({ user: req.user._id, day: { $gte: days[0], $lte: days[days.length - 1] } })
        .sort({ day: -1, createdAt: -1 })
        .lean();

    const series = days.map((day) => ({ day, litres: 0, income: 0, expense: 0 }));
    const index = new Map(series.map((item, position) => [item.day, position]));

    const totals = { litres: 0, milkIncome: 0, otherIncome: 0, expense: 0 };
    const byCategory = {};

    for (const entry of entries) {
        const point = series[index.get(entry.day)];

        if (entry.kind === "milk") {
            const litres = (entry.morningLitres || 0) + (entry.eveningLitres || 0);
            point.litres += litres;
            point.income += entry.amount || 0;
            totals.litres += litres;
            totals.milkIncome += entry.amount || 0;
        } else if (entry.kind === "income") {
            point.income += entry.amount;
            totals.otherIncome += entry.amount;
        } else {
            point.expense += entry.amount;
            totals.expense += entry.amount;
            byCategory[entry.category || "other"] = (byCategory[entry.category || "other"] || 0) + entry.amount;
        }
    }

    const income = totals.milkIncome + totals.otherIncome;
    const milkDays = entries.filter((entry) => entry.kind === "milk").length;

    const today = dayKey();
    const todayMilk = entries.find((entry) => entry.kind === "milk" && entry.day === today) || null;

    return res.status(200).render("dairy/index", {
        title: "Dairy Record | BoviNetra",
        user: req.user,
        month,
        prevMonth: shiftMonth(month, -1),
        nextMonth: month < current ? shiftMonth(month, 1) : null,
        today,
        todayMilk,
        entries: entries.slice(0, 120),
        series: series.map((item) => ({ ...item, litres: round(item.litres), income: round(item.income), expense: round(item.expense) })),
        summary: {
            litres: round(totals.litres),
            avgLitres: milkDays ? round(totals.litres / milkDays) : 0,
            income: round(income),
            expense: round(totals.expense),
            profit: round(income - totals.expense),
            milkDays
        },
        byCategory: Object.entries(byCategory)
            .map(([name, value]) => ({ name, value: round(value) }))
            .sort((a, b) => b.value - a.value),
        expenseCategories: EXPENSE_CATEGORIES,
        incomeCategories: INCOME_CATEGORIES,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

export const saveMilk = asyncHandler(async (req, res) => {
    const day = validDay(req.body?.day);
    const morning = number(req.body?.morningLitres, 0, 1000);
    const evening = number(req.body?.eveningLitres, 0, 1000);
    const rate = number(req.body?.ratePerLitre, 0, 1000);

    if (!day) return reject(req, res, { message: "Choose a valid date (not in the future)", redirectTo: HOME });

    if ([morning, evening, rate].some(Number.isNaN)) {
        return reject(req, res, { message: "Enter valid litres and rate", redirectTo: HOME });
    }

    if (!morning && !evening) {
        return reject(req, res, { message: "Enter morning or evening litres", redirectTo: HOME });
    }

    await DairyEntry.updateOne(
        { user: req.user._id, kind: "milk", day },
        {
            $set: {
                morningLitres: morning,
                eveningLitres: evening,
                ratePerLitre: rate,
                amount: round((morning + evening) * rate),
                note: queryString(req.body?.note, 150)
            },
            $setOnInsert: { user: req.user._id, kind: "milk", day }
        },
        { upsert: true }
    );

    return respond(req, res, { redirectTo: `${HOME}?month=${day.slice(0, 7)}`, message: "Milk record saved" });
});

export const addMoney = asyncHandler(async (req, res) => {
    const kind = req.body?.kind === "income" ? "income" : req.body?.kind === "expense" ? "expense" : null;
    const day = validDay(req.body?.day);
    const amount = number(req.body?.amount, 0, 100000000);

    if (!kind) return reject(req, res, { message: "Choose expense or income", redirectTo: HOME });
    if (!day) return reject(req, res, { message: "Choose a valid date (not in the future)", redirectTo: HOME });

    if (Number.isNaN(amount) || amount <= 0) {
        return reject(req, res, { message: "Enter an amount greater than zero", redirectTo: HOME });
    }

    const allowed = kind === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;
    const category = allowed.includes(req.body?.category) ? req.body.category : "other";

    await DairyEntry.create({
        user: req.user._id,
        kind,
        day,
        amount,
        category,
        note: queryString(req.body?.note, 150)
    });

    return respond(req, res, {
        redirectTo: `${HOME}?month=${day.slice(0, 7)}`,
        message: kind === "expense" ? "Expense added" : "Income added"
    });
});

export const deleteEntry = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) return reject(req, res, { status: 404, message: "Entry not found", redirectTo: HOME });

    const removed = await DairyEntry.findOneAndDelete({ _id: req.params.id, user: req.user._id });

    if (!removed) return reject(req, res, { status: 404, message: "Entry not found", redirectTo: HOME });

    return respond(req, res, { redirectTo: `${HOME}?month=${removed.day.slice(0, 7)}`, message: "Entry deleted" });
});
