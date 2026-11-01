const OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const MONTH_PATTERN = /^\d{4}-\d{2}$/;

const pad = (value) => String(value).padStart(2, "0");

export const dayKey = (date = new Date()) => {
    const shifted = new Date(new Date(date).getTime() + OFFSET_MS);

    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
};

export const isDayKey = (value) => {
    if (typeof value !== "string" || !DAY_PATTERN.test(value)) return false;

    const date = new Date(`${value}T00:00:00.000Z`);

    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

export const dayStart = (key) => new Date(new Date(`${key}T00:00:00.000Z`).getTime() - OFFSET_MS);

export const addDays = (key, days) =>
    new Date(new Date(`${key}T00:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);

export const daysBetween = (fromKey, toKey) =>
    Math.round((new Date(`${toKey}T00:00:00.000Z`) - new Date(`${fromKey}T00:00:00.000Z`)) / DAY_MS);

export const weekdayOf = (key) => new Date(`${key}T00:00:00.000Z`).getUTCDay();

export const monthKey = (date = new Date()) => dayKey(date).slice(0, 7);

export const monthDays = (month) => {
    const [year, mon] = month.split("-").map(Number);
    const count = new Date(Date.UTC(year, mon, 0)).getUTCDate();

    return Array.from({ length: count }, (_, index) => `${month}-${pad(index + 1)}`);
};

export const shiftMonth = (month, delta) => {
    const [year, mon] = month.split("-").map(Number);
    const date = new Date(Date.UTC(year, mon - 1 + delta, 1));

    return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}`;
};

export const slotAt = (key, hhmm) => {
    const [hours, minutes] = hhmm.split(":").map(Number);

    return new Date(dayStart(key).getTime() + (hours * 60 + minutes) * 60 * 1000);
};

export const formatSlot = (date) =>
    new Date(date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
    });
