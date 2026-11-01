import { PushSubscription } from "../models/pushSubscription.model.js";

let setup = null;

const load = () => {
    if (!setup) {
        setup = (async () => {
            const publicKey = process.env.VAPID_PUBLIC_KEY;
            const privateKey = process.env.VAPID_PRIVATE_KEY;

            if (!publicKey || !privateKey) return null;

            try {
                const mod = await import("web-push");
                const lib = mod.default || mod;
                const subject = process.env.VAPID_SUBJECT || `mailto:${process.env.SMTP_USER || "admin@example.com"}`;

                lib.setVapidDetails(subject, publicKey, privateKey);

                return lib;
            } catch (error) {
                console.warn("[push] web-push is not installed, push notifications are off:", error.message);
                return null;
            }
        })();
    }

    return setup;
};

export const pushEnabled = async () => Boolean(await load());

export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || "";

export const sendPushToUser = async (userId, { title, body = "", link = "" }) => {
    const lib = await load();

    if (!lib) return;

    const subscriptions = await PushSubscription.find({ user: userId }).limit(10).lean();

    if (!subscriptions.length) return;

    const payload = JSON.stringify({
        title: String(title).slice(0, 100),
        body: String(body).slice(0, 160),
        link: typeof link === "string" && link.startsWith("/") ? link : "/notifications"
    });

    await Promise.all(
        subscriptions.map(async (subscription) => {
            try {
                await lib.sendNotification(
                    { endpoint: subscription.endpoint, keys: subscription.keys },
                    payload,
                    { TTL: 60 * 60 * 24 }
                );
            } catch (error) {
                if (error.statusCode === 404 || error.statusCode === 410) {
                    await PushSubscription.deleteOne({ _id: subscription._id });
                } else {
                    console.error("[push] send failed:", error.statusCode || error.message);
                }
            }
        })
    );
};
