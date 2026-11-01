import { User } from "../models/user.model.js";
import { Cattle } from "../models/cattle.model.js";
import { Product } from "../models/product.model.js";
import { Order } from "../models/order.model.js";
import { Reel } from "../models/reel.model.js";
import { Offer } from "../models/offer.model.js";
import { Appointment } from "../models/appointment.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { addDays, dayKey, dayStart } from "../utils/ist.js";

const RANGES = Object.freeze([7, 30, 90]);
const IST = "+05:30";

const perDay = (since, extra = {}) => [
    { $match: { createdAt: { $gte: since }, ...extra } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: IST } }, count: { $sum: 1 }, amount: { $sum: { $ifNull: ["$totalAmount", 0] } } } }
];

const fill = (days, rows, field = "count") => {
    const map = new Map(rows.map((row) => [row._id, row[field]]));

    return days.map((day) => Math.round((map.get(day) || 0) * 100) / 100);
};

const countBy = (Model, field, match = {}, limit = 10) =>
    Model.aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);

const sumRows = (rows) => rows.reduce((total, row) => total + row.count, 0);

export const showAnalytics = asyncHandler(async (req, res) => {
    const requested = Number(req.query.range);
    const range = RANGES.includes(requested) ? requested : 30;
    const today = dayKey();
    const startKey = addDays(today, -(range - 1));
    const since = dayStart(startKey);
    const days = Array.from({ length: range }, (_, index) => addDays(startKey, index));
    const sold = { orderStatus: { $nin: ["Pending", "Cancelled"] } };

    const [
        usersDaily,
        cattleDaily,
        ordersDaily,
        usersTotal,
        usersByRole,
        cattleTotal,
        cattleForSale,
        cattleByCategory,
        cattleByState,
        productsTotal,
        ordersByStatus,
        reelsTotal,
        offersByStatus,
        appointmentsByStatus,
        revenueRows
    ] = await Promise.all([
        User.aggregate(perDay(since)),
        Cattle.aggregate(perDay(since)),
        Order.aggregate(perDay(since, sold)),
        User.countDocuments(),
        countBy(User, "role"),
        Cattle.countDocuments(),
        Cattle.countDocuments({ isActive: { $ne: false }, sold: { $ne: true } }),
        countBy(Cattle, "category"),
        countBy(Cattle, "locationState", { locationState: { $exists: true, $ne: null } }),
        Product.countDocuments(),
        countBy(Order, "orderStatus"),
        Reel.countDocuments(),
        countBy(Offer, "status"),
        countBy(Appointment, "status"),
        Order.aggregate([{ $match: sold }, { $group: { _id: null, revenue: { $sum: { $ifNull: ["$totalAmount", 0] } }, count: { $sum: 1 } } }])
    ]);

    const series = {
        days,
        users: fill(days, usersDaily),
        cattle: fill(days, cattleDaily),
        orders: fill(days, ordersDaily),
        revenue: fill(days, ordersDaily, "amount")
    };

    const total = (values) => values.reduce((sum, value) => sum + value, 0);

    return res.status(200).render("admin/analytics", {
        title: "Analytics | BoviNetra",
        user: req.user,
        range,
        ranges: RANGES,
        series,
        period: {
            users: total(series.users),
            cattle: total(series.cattle),
            orders: total(series.orders),
            revenue: Math.round(total(series.revenue))
        },
        totals: {
            users: usersTotal,
            cattle: cattleTotal,
            cattleForSale,
            products: productsTotal,
            reels: reelsTotal,
            orders: revenueRows[0]?.count || 0,
            revenue: Math.round(revenueRows[0]?.revenue || 0)
        },
        breakdowns: {
            "Users by role": usersByRole,
            "Cattle by category": cattleByCategory,
            "Top states for cattle": cattleByState,
            "Orders by status": ordersByStatus,
            "Offers by status": offersByStatus,
            "Appointments by status": appointmentsByStatus
        },
        sumRows
    });
});
