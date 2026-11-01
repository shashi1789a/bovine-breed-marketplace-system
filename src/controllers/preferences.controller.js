import { PushSubscription, MAX_DEVICES_PER_USER } from "../models/pushSubscription.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { queryString, readFlash, reject, respond } from "../utils/http.js";
import { pushEnabled, vapidPublicKey } from "../services/push.service.js";

const HOME = "/account/preferences";
const PHONE = /^[6-9]\d{9}$/;

const checked = (value) => value === "on" || value === "true" || value === true;

export const showPreferences = asyncHandler(async (req, res) => {
    const me = await User.findById(req.user._id)
        .select("notificationPrefs privacy contactPhone role")
        .lean();

    const devices = await PushSubscription.countDocuments({ user: req.user._id });

    return res.render("account/preferences", {
        title: "Settings | BoviNetra",
        user: req.user,
        prefs: {
            email: me?.notificationPrefs?.email !== false,
            push: me?.notificationPrefs?.push !== false,
            showPresence: me?.privacy?.showPresence !== false,
            showContact: Boolean(me?.privacy?.showContact),
            contactPhone: me?.contactPhone || ""
        },
        isFarmer: me?.role === "farmer",
        pushAvailable: await pushEnabled(),
        devices,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

export const savePreferences = asyncHandler(async (req, res) => {
    const me = await User.findById(req.user._id);

    const update = {
        "notificationPrefs.email": checked(req.body?.email),
        "notificationPrefs.push": checked(req.body?.push),
        "privacy.showPresence": checked(req.body?.showPresence)
    };

    if (me.role === "farmer") {
        const phone = queryString(req.body?.contactPhone, 15).replace(/[\s-]/g, "").replace(/^\+?91/, "");
        const showContact = checked(req.body?.showContact);

        if (phone && !PHONE.test(phone)) {
            return reject(req, res, { status: 400, message: "Enter a valid 10 digit mobile number", redirectTo: HOME });
        }

        if (showContact && !phone) {
            return reject(req, res, {
                status: 400,
                message: "Add your phone number to show Call and WhatsApp buttons",
                redirectTo: HOME
            });
        }

        update.contactPhone = phone || undefined;
        update["privacy.showContact"] = showContact;
    }

    await User.updateOne({ _id: me._id }, { $set: update });

    return respond(req, res, { redirectTo: HOME, data: {}, message: "Settings saved" });
});

export const pushKey = asyncHandler(async (req, res) => {
    const enabled = await pushEnabled();

    return res.status(200).json(new ApiResponse(200, { enabled, key: enabled ? vapidPublicKey() : "" }, "OK"));
});

export const pushSubscribe = asyncHandler(async (req, res) => {
    if (!(await pushEnabled())) throw new ApiError(503, "Push notifications are not set up on the server");

    const endpoint = String(req.body?.endpoint || "");
    const p256dh = String(req.body?.keys?.p256dh || "");
    const auth = String(req.body?.keys?.auth || "");

    if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || !auth) {
        throw new ApiError(400, "Invalid subscription");
    }

    const count = await PushSubscription.countDocuments({ user: req.user._id, endpoint: { $ne: endpoint } });

    if (count >= MAX_DEVICES_PER_USER) {
        const oldest = await PushSubscription.find({ user: req.user._id }).sort({ _id: 1 }).limit(count - MAX_DEVICES_PER_USER + 1);
        await PushSubscription.deleteMany({ _id: { $in: oldest.map((item) => item._id) } });
    }

    await PushSubscription.updateOne(
        { endpoint },
        {
            $set: {
                user: req.user._id,
                keys: { p256dh: p256dh.slice(0, 200), auth: auth.slice(0, 100) },
                userAgent: String(req.get("user-agent") || "").slice(0, 200)
            }
        },
        { upsert: true }
    );

    await User.updateOne({ _id: req.user._id }, { $set: { "notificationPrefs.push": true } });

    return res.status(201).json(new ApiResponse(201, {}, "Push notifications are on for this device"));
});

export const pushUnsubscribe = asyncHandler(async (req, res) => {
    const endpoint = String(req.body?.endpoint || "");

    await PushSubscription.deleteOne({ user: req.user._id, endpoint });

    return res.status(200).json(new ApiResponse(200, {}, "Push notifications are off for this device"));
});
