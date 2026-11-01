import { Notification } from "../models/notification.model.js";
import { User } from "../models/user.model.js";
import { sendNotificationMail } from "../utils/mailer.js";
import { sendPushToUser } from "./push.service.js";

const EMAIL_TYPES = new Set([
    "new_message",
    "offer_received",
    "offer_accepted",
    "offer_rejected",
    "cattle_sold",
    "price_drop",
    "order_new",
    "order_update",
    "verification",
    "reminder",
    "appointment"
]);

const THROTTLE_MS = Object.freeze({
    new_message: 10 * 60 * 1000,
    reel_comment: 30 * 60 * 1000,
    new_follower: 6 * 60 * 60 * 1000
});

const recent = new Map();

const isThrottled = (userId, type, link) => {
    const windowMs = THROTTLE_MS[type];

    if (!windowMs) return false;

    const now = Date.now();
    const key = `${userId}:${type}:${link}`;
    const last = recent.get(key);

    if (last && now - last < windowMs) return true;

    recent.set(key, now);

    if (recent.size > 5000) {
        for (const [entryKey, time] of recent) {
            if (now - time > 6 * 60 * 60 * 1000) recent.delete(entryKey);
        }
    }

    return false;
};

const shape = ({ type, title, body = "", link = "" }) => ({
    type,
    title: String(title).slice(0, 120),
    body: String(body).slice(0, 300),
    link: String(link).slice(0, 300)
});

const deliver = async (userIds, payload) => {
    const users = await User.find({ _id: { $in: userIds }, isActive: { $ne: false } })
        .select("email fullName notificationPrefs")
        .lean();

    await Promise.all(
        users.map(async (user) => {
            const tasks = [];

            if (user.notificationPrefs?.push !== false) {
                tasks.push(sendPushToUser(user._id, payload));
            }

            if (EMAIL_TYPES.has(payload.type) && user.notificationPrefs?.email !== false && user.email) {
                tasks.push(
                    sendNotificationMail({
                        to: user.email,
                        name: user.fullName,
                        title: payload.title,
                        body: payload.body,
                        link: payload.link
                    })
                );
            }

            await Promise.allSettled(tasks);
        })
    );
};

const deliverInBackground = (userIds, payload) => {
    deliver(userIds, payload).catch((error) => console.error("[notify] delivery failed:", error.message));
};

export const notify = async (userId, payload) => {
    const data = shape(payload);

    if (isThrottled(String(userId), data.type, data.link)) return;

    try {
        await Notification.create({ user: userId, ...data });
        deliverInBackground([userId], data);
    } catch (error) {
        console.error("[notify] failed:", error.message);
    }
};

export const notifyMany = async (userIds, payload) => {
    const data = shape(payload);
    const unique = [...new Set(userIds.map(String))].filter((id) => !isThrottled(id, data.type, data.link));

    if (!unique.length) return;

    try {
        await Notification.insertMany(
            unique.map((user) => ({ user, ...data })),
            { ordered: false }
        );
        deliverInBackground(unique, data);
    } catch (error) {
        console.error("[notify] failed:", error.message);
    }
};
