import { Notification } from "../models/notification.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

export const showNotifications = asyncHandler(async (req, res) => {
    const items = await Notification.find({ user: req.user._id })
        .sort({ _id: -1 })
        .limit(60)
        .lean();

    const unreadIds = items.filter((item) => !item.readAt).map((item) => item._id);

    if (unreadIds.length) {
        await Notification.updateMany({ _id: { $in: unreadIds } }, { $set: { readAt: new Date() } });
    }

    return res.render("notifications/index", {
        title: "Notifications | BoviNetra",
        user: req.user,
        items
    });
});

export const unreadCount = asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({ user: req.user._id, readAt: null });

    return res.status(200).json(new ApiResponse(200, { count }, "OK"));
});
