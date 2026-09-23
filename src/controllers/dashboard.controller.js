/**
 * =============================================================================
 * dashboard.controller.js
 * -----------------------------------------------------------------------------
 * Role based dashboards for: farmer | doctor | buyer | user
 * (Admin has its own controller and is intentionally NOT handled here.)
 *
 * DESIGN
 *  - Role is ALWAYS read from req.user (loaded from DB by verifyJWT).
 *    It is never read from params / body / query.
 *  - One "builder" per role. Adding a new role = add a builder + a view + one
 *    line in the config maps below. Nothing else changes.
 *  - Every page handler double-checks the role. If someone opens another
 *    role's dashboard URL, they are redirected to their own dashboard and no
 *    data of the other role is ever loaded.
 *  - Heavy numbers come from MongoDB aggregations (no loading full
 *    collections into Node memory).
 *  - A widget that fails does not kill the whole page: the failed widget falls
 *    back to empty values and its name is added to `warnings`.
 *  - Sellers only ever see their OWN products' lines inside an order. Other
 *    sellers' items and buyer contact details are never exposed.
 *
 * DATA PASSED TO EVERY VIEW
 *  { title, user, role, stats, alerts, recentOrders, warnings, success, error, ... }
 *
 *  farmer / doctor  -> stats.products, stats.sales, stats.purchases,
 *                      recentProducts   (farmer also: stats.cattle, recentCattles)
 *  buyer / user     -> stats.orders, stats.cart, recommendedProducts
 * =============================================================================
 */

import mongoose from "mongoose";

import { Product } from "../models/product.model.js";
import { Cattle } from "../models/cattle.model.js";
import { Order } from "../models/order.model.js";
import { Cart } from "../models/cart.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";


/* =========================================================
   CONFIG  (the only place you should need to edit routes/views)
========================================================= */
const ROLES = Object.freeze({
    ADMIN: "admin",
    FARMER: "farmer",
    DOCTOR: "doctor",
    BUYER: "buyer",
    USER: "user"
});

// Where each role lands after login
const ROLE_HOME = Object.freeze({
    [ROLES.ADMIN]: "/admin/dashboard",
    [ROLES.FARMER]: "/farmer/dashboard",
    [ROLES.DOCTOR]: "/doctor/dashboard",
    [ROLES.BUYER]: "/buyer/dashboard",
    [ROLES.USER]: "/dashboard"
});

const DASHBOARD_VIEW = Object.freeze({
    [ROLES.FARMER]: "dashboard/farmerDashboard",
    [ROLES.DOCTOR]: "dashboard/doctorDashboard",
    [ROLES.BUYER]: "dashboard/buyerDashboard",
    [ROLES.USER]: "dashboard/userDashboard"
});

const DASHBOARD_TITLE = Object.freeze({
    [ROLES.FARMER]: "Farmer Dashboard",
    [ROLES.DOCTOR]: "Doctor Dashboard",
    [ROLES.BUYER]: "Buyer Dashboard",
    [ROLES.USER]: "My Dashboard"
});

// Links used inside seller alerts
const sellerRoutes = (role) => ({
    products: `/${role}/products`,
    orders: `/${role}/orders`
});

const ORDER_STATUS = Object.freeze({
    PENDING: "Pending",       // checkout started, not confirmed -> never counted
    PLACED: "Placed",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
});

const PAYMENT_STATUS = Object.freeze({
    PAID: "Paid"
});

const TIMEZONE = process.env.APP_TIMEZONE || "Asia/Kolkata";
const RECENT_LIMIT = 5;
const TOP_PRODUCTS_LIMIT = 5;
const CHART_MONTHS = 6;
const EXPIRY_WARNING_DAYS = 30;
const RECOMMENDED_LIMIT = 8;
const MAX_FLASH_LENGTH = 200;

const DAY_MS = 24 * 60 * 60 * 1000;


/* =========================================================
   SMALL HELPERS
========================================================= */
const toObjectId = (id) => new mongoose.Types.ObjectId(String(id));

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const daysFromNow = (days) => new Date(Date.now() + days * DAY_MS);

// $sum helper: counts documents where `condition` is true
const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

// true only when the field really holds a Date (null / missing -> false)
const isDate = (field) => ({ $eq: [{ $type: field }, "date"] });

// An order line counts as "money received" when paid online or delivered (COD)
const REALISED = {
    $or: [
        { $eq: ["$paymentStatus", PAYMENT_STATUS.PAID] },
        { $eq: ["$orderStatus", ORDER_STATUS.DELIVERED] }
    ]
};

// Query-string flash messages: strings only, length limited
const readFlash = (value) =>
    typeof value === "string" && value.trim()
        ? value.trim().slice(0, MAX_FLASH_LENGTH)
        : null;

// Only these user fields ever reach a view
const SAFE_USER_FIELDS = [
    "_id", "fullName", "username", "email", "avatar", "coverImage",
    "role", "farmerDetails", "doctorDetails", "buyerDetails", "createdAt"
];

const toSafeUser = (user) => {
    const plain = typeof user.toObject === "function" ? user.toObject() : user;

    return Object.fromEntries(
        SAFE_USER_FIELDS
            .filter((key) => plain[key] !== undefined)
            .map((key) => [key, plain[key]])
    );
};

// Runs one widget query. On failure: logs, records a warning, returns fallback.
const safely = async (label, task, fallback, warnings) => {
    try {
        return await task();
    } catch (error) {
        console.error(`[dashboard] "${label}" failed:`, error);
        warnings.push(label);
        return fallback;
    }
};

// Last N calendar months (in TIMEZONE) for charts, oldest -> newest
const getMonthBuckets = (months = CHART_MONTHS) => {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIMEZONE,
        year: "numeric",
        month: "2-digit"
    }).formatToParts(new Date());

    const year = Number(parts.find((p) => p.type === "year").value);
    const month = Number(parts.find((p) => p.type === "month").value) - 1;

    const buckets = [];

    for (let i = months - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(year, month - i, 1));

        buckets.push({
            key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
            label: d.toLocaleString("en-IN", {
                month: "short",
                year: "2-digit",
                timeZone: "UTC"
            })
        });
    }

    // 1 day buffer so timezone offsets never cut off the first month
    const startDate = new Date(
        Date.UTC(year, month - (months - 1), 1) - DAY_MS
    );

    return { buckets, startDate };
};

// Months with no sales still appear in the chart with 0
const fillMonthlySeries = (buckets, rows) => {
    const byMonth = new Map(rows.map((row) => [row._id, row]));

    return buckets.map(({ key, label }) => {
        const row = byMonth.get(key);

        return {
            month: key,
            label,
            revenue: round2(row?.revenue),
            orders: row?.orders || 0
        };
    });
};


/* =========================================================
   EMPTY / FALLBACK SHAPES
========================================================= */
const EMPTY_PRODUCT_STATS = Object.freeze({
    total: 0,
    active: 0,
    featured: 0,
    approved: 0,
    pendingApproval: 0,
    rejected: 0,
    outOfStock: 0,
    lowStock: 0,
    expired: 0,
    expiringSoon: 0,
    totalStock: 0,
    inventoryValue: 0,
    totalViews: 0,
    totalUnitsSold: 0,
    byCategory: []
});

const EMPTY_BUYER_STATS = Object.freeze({
    totalOrders: 0,
    activeOrders: 0,
    deliveredOrders: 0,
    cancelledOrders: 0,
    totalSpent: 0
});

const EMPTY_CART = Object.freeze({
    totalItems: 0,
    totalQuantity: 0,
    totalAmount: 0
});

const EMPTY_CATTLE_STATS = Object.freeze({
    total: 0,
    sold: 0,
    available: 0
});

const emptySalesStats = () => ({
    totalOrders: 0,
    openOrders: 0,
    deliveredOrders: 0,
    unitsSold: 0,
    revenue: 0,
    awaitingRevenue: 0,
    revenueThisMonth: 0,
    monthlySales: fillMonthlySeries(getMonthBuckets().buckets, []),
    ordersByStatus: [],
    topProducts: [],
    recentOrders: []
});


/* =========================================================
   SELLER (FARMER / DOCTOR) - PRODUCT STATS
========================================================= */
const getSellerProductStats = async (sellerId) => {

    const now = new Date();
    const soonLimit = daysFromNow(EXPIRY_WARNING_DAYS);

    const [result] = await Product.aggregate([
        { $match: { owner: sellerId } },
        {
            $facet: {
                summary: [
                    {
                        $group: {
                            _id: null,
                            total: { $sum: 1 },
                            active: countIf("$isActive"),
                            featured: countIf("$featured"),
                            approved: countIf({ $eq: ["$approvalStatus", "Approved"] }),
                            pendingApproval: countIf({ $eq: ["$approvalStatus", "Pending"] }),
                            rejected: countIf({ $eq: ["$approvalStatus", "Rejected"] }),
                            outOfStock: countIf({ $lte: [{ $ifNull: ["$stock", 0] }, 0] }),
                            lowStock: countIf({
                                $and: [
                                    { $gt: ["$stock", 0] },
                                    { $lte: ["$stock", { $ifNull: ["$minStock", 0] }] }
                                ]
                            }),
                            expired: countIf({
                                $and: [isDate("$expiryDate"), { $lt: ["$expiryDate", now] }]
                            }),
                            expiringSoon: countIf({
                                $and: [
                                    isDate("$expiryDate"),
                                    { $gte: ["$expiryDate", now] },
                                    { $lte: ["$expiryDate", soonLimit] }
                                ]
                            }),
                            totalStock: { $sum: { $ifNull: ["$stock", 0] } },
                            inventoryValue: {
                                $sum: {
                                    $multiply: [
                                        { $ifNull: ["$price", 0] },
                                        { $ifNull: ["$stock", 0] }
                                    ]
                                }
                            },
                            totalViews: { $sum: { $ifNull: ["$views", 0] } },
                            totalUnitsSold: { $sum: { $ifNull: ["$soldCount", 0] } }
                        }
                    }
                ],
                byCategory: [
                    { $group: { _id: "$category", count: { $sum: 1 } } },
                    { $sort: { count: -1 } }
                ]
            }
        }
    ]);

    const { _id, ...summary } = result?.summary?.[0] || {};

    return {
        ...EMPTY_PRODUCT_STATS,
        ...summary,
        inventoryValue: round2(summary.inventoryValue),
        byCategory: (result?.byCategory || []).map((row) => ({
            category: row._id || "Other",
            count: row.count
        }))
    };
};


/* =========================================================
   SELLER (FARMER / DOCTOR) - SALES STATS
   An Order now belongs to exactly one seller, so this matches
   directly on Order.seller instead of joining through product ids.
========================================================= */
const getSellerSalesStats = async (sellerId) => {

    const { buckets, startDate } = getMonthBuckets();

    const [aggregated, recentRaw] = await Promise.all([

        Order.aggregate([
            {
                $match: {
                    seller: sellerId,
                    orderStatus: {
                        $nin: [ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED]
                    }
                }
            },
            {
                $addFields: {
                    isRealised: REALISED
                }
            },
            {
                $facet: {
                    totals: [
                        {
                            $group: {
                                _id: null,
                                unitsSold: { $sum: "$items.quantity" },
                                revenue: { $sum: { $cond: ["$isRealised", "$totalAmount", 0] } },
                                awaitingRevenue: { $sum: { $cond: ["$isRealised", 0, "$totalAmount"] } }
                            }
                        }
                    ],
                    ordersByStatus: [
                        { $group: { _id: "$orderStatus", count: { $sum: 1 } } }
                    ],
                    monthly: [
                        { $match: { createdAt: { $gte: startDate } } },
                        {
                            $group: {
                                _id: {
                                    $dateToString: {
                                        format: "%Y-%m",
                                        date: "$createdAt",
                                        timezone: TIMEZONE
                                    }
                                },
                                revenue: { $sum: { $cond: ["$isRealised", "$totalAmount", 0] } },
                                orders: { $sum: 1 }
                            }
                        }
                    ],
                    topProducts: [
                        { $unwind: "$items" },
                        {
                            $group: {
                                _id: "$items.product",
                                name: { $first: "$items.name" },
                                image: { $first: "$items.image" },
                                unitsSold: { $sum: "$items.quantity" },
                                revenue: { $sum: "$items.lineTotal" }
                            }
                        },
                        { $sort: { revenue: -1 } },
                        { $limit: TOP_PRODUCTS_LIMIT }
                    ]
                }
            }
        ]),

        Order.find({
            seller: sellerId,
            orderStatus: { $ne: ORDER_STATUS.PENDING }
        })
            .sort({ createdAt: -1 })
            .limit(RECENT_LIMIT)
            .populate("user", "fullName")
            .lean()
    ]);

    const result = aggregated?.[0] || {};
    const totals = result.totals?.[0] || {};

    const ordersByStatus = (result.ordersByStatus || []).map((row) => ({
        status: row._id || "Unknown",
        count: row.count
    }));

    const totalOrders = ordersByStatus.reduce((sum, row) => sum + row.count, 0);

    const deliveredOrders =
        ordersByStatus.find((row) => row.status === ORDER_STATUS.DELIVERED)?.count || 0;

    const monthlySales = fillMonthlySeries(buckets, result.monthly || []);

    // Every item on the order already belongs to this seller, so the
    // embedded snapshot can be shown as-is - no product lookup needed.
    const recentOrders = recentRaw.map((order) => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        buyerName: order.user?.fullName || "Customer",
        items: (order.items || []).map((item) => ({
            productId: item.product,
            name: item.name,
            image: item.image || "",
            quantity: item.quantity,
            price: item.price
        })),
        sellerTotal: round2(order.totalAmount)
    }));

    return {
        totalOrders,
        openOrders: totalOrders - deliveredOrders,
        deliveredOrders,
        unitsSold: totals.unitsSold || 0,
        revenue: round2(totals.revenue),
        awaitingRevenue: round2(totals.awaitingRevenue),
        revenueThisMonth: monthlySales[monthlySales.length - 1]?.revenue || 0,
        monthlySales,
        ordersByStatus,
        topProducts: (result.topProducts || []).map((p) => ({
            ...p,
            revenue: round2(p.revenue)
        })),
        recentOrders
    };
};


/* =========================================================
   BUYER STATS  (also used for farmer/doctor "my purchases")
========================================================= */
const getBuyerOrderStats = async (userId) => {

    const [stats] = await Order.aggregate([
        {
            $match: {
                user: userId,
                orderStatus: { $ne: ORDER_STATUS.PENDING }
            }
        },
        {
            $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                deliveredOrders: countIf({ $eq: ["$orderStatus", ORDER_STATUS.DELIVERED] }),
                cancelledOrders: countIf({ $eq: ["$orderStatus", ORDER_STATUS.CANCELLED] }),
                activeOrders: countIf({
                    $not: [{
                        $in: ["$orderStatus", [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED]]
                    }]
                }),
                totalSpent: {
                    $sum: {
                        $cond: [
                            {
                                $and: [
                                    { $ne: ["$orderStatus", ORDER_STATUS.CANCELLED] },
                                    REALISED
                                ]
                            },
                            { $ifNull: ["$totalAmount", 0] },
                            0
                        ]
                    }
                }
            }
        }
    ]);

    const { _id, ...summary } = stats || {};

    return {
        ...EMPTY_BUYER_STATS,
        ...summary,
        totalSpent: round2(summary.totalSpent)
    };
};

const getBuyerRecentOrders = async (userId) => {

    const orders = await Order.find({
        user: userId,
        orderStatus: { $ne: ORDER_STATUS.PENDING }
    })
        .sort({ createdAt: -1 })
        .limit(RECENT_LIMIT)
        .populate("seller", "fullName username")
        .lean();

    return orders.map((order) => ({
        _id: order._id,
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        orderStatus: order.orderStatus,
        paymentStatus: order.paymentStatus,
        paymentMethod: order.paymentMethod,
        sellerName: order.seller?.fullName || "Seller",
        totalAmount: round2(order.totalAmount),
        items: (order.items || []).map((item) => ({
            productId: item.product,
            name: item.name,
            image: item.image || "",
            quantity: item.quantity,
            price: item.price
        }))
    }));
};

const getCartSummary = async (userId) => {

    const cart = await Cart.findOne({ user: userId })
        .select("totalItems totalQuantity totalAmount")
        .lean();

    return {
        totalItems: cart?.totalItems || 0,
        totalQuantity: cart?.totalQuantity || 0,
        totalAmount: round2(cart?.totalAmount)
    };
};

// Only approved, active, in-stock and NOT expired products
const getRecommendedProducts = async () =>
    Product.find({
        isActive: true,
        approvalStatus: "Approved",
        stock: { $gt: 0 },
        $or: [
            { expiryDate: null },
            { expiryDate: { $gt: new Date() } }
        ]
    })
        .sort({ createdAt: -1 })
        .limit(RECOMMENDED_LIMIT)
        .select("name image price mrp category ratings numOfReviews stock")
        .lean();


/* =========================================================
   FARMER - CATTLE STATS
========================================================= */
const getFarmerCattleStats = async (farmerId) => {

    const [stats] = await Cattle.aggregate([
        { $match: { farmer: farmerId } },
        {
            $group: {
                _id: null,
                total: { $sum: 1 },
                sold: countIf("$sold")
            }
        }
    ]);

    const total = stats?.total || 0;
    const sold = stats?.sold || 0;

    return { total, sold, available: total - sold };
};


/* =========================================================
   SELLER ALERTS  (things the seller must act on)
========================================================= */
const buildSellerAlerts = (role, products, sales) => {

    const routes = sellerRoutes(role);
    const alerts = [];

    const add = (code, level, count, message, link) => {
        if (count > 0) alerts.push({ code, level, count, message, link });
    };

    add("EXPIRED_PRODUCTS", "danger", products.expired,
        `${products.expired} product(s) have expired. Deactivate or remove them.`,
        routes.products);

    add("REJECTED_PRODUCTS", "danger", products.rejected,
        `${products.rejected} product(s) were rejected by admin.`,
        routes.products);

    add("OUT_OF_STOCK", "warning", products.outOfStock,
        `${products.outOfStock} product(s) are out of stock.`,
        routes.products);

    add("LOW_STOCK", "warning", products.lowStock,
        `${products.lowStock} product(s) are running low on stock.`,
        routes.products);

    add("EXPIRING_SOON", "warning", products.expiringSoon,
        `${products.expiringSoon} product(s) expire within ${EXPIRY_WARNING_DAYS} days.`,
        routes.products);

    add("PENDING_APPROVAL", "info", products.pendingApproval,
        `${products.pendingApproval} product(s) are waiting for admin approval.`,
        routes.products);

    add("OPEN_ORDERS", "info", sales.openOrders,
        `${sales.openOrders} order(s) are waiting to be delivered.`,
        routes.orders);

    return alerts;
};


/* =========================================================
   ROLE BUILDERS
   Each builder receives (user, warnings) and returns the role's data.
========================================================= */
const buildSellerDashboard = async (user, warnings) => {

    const role = user.role.toLowerCase();
    const sellerId = toObjectId(user._id);

    const [products, sales, purchases, recentProducts] = await Promise.all([

        safely("Product statistics",
            () => getSellerProductStats(sellerId),
            EMPTY_PRODUCT_STATS, warnings),

        safely("Sales statistics",
            () => getSellerSalesStats(sellerId),
            emptySalesStats(), warnings),

        safely("Purchase statistics",
            () => getBuyerOrderStats(sellerId),
            EMPTY_BUYER_STATS, warnings),

        safely("Recent products",
            () => Product.find({ owner: sellerId })
                .sort({ createdAt: -1 })
                .limit(RECENT_LIMIT)
                .select("name image price stock category approvalStatus isActive createdAt")
                .lean(),
            [], warnings)
    ]);

    const { recentOrders, ...salesStats } = sales;

    return {
        stats: { products, sales: salesStats, purchases },
        recentProducts,
        recentOrders,
        alerts: buildSellerAlerts(role, products, salesStats)
    };
};

const buildFarmerDashboard = async (user, warnings) => {

    const farmerId = toObjectId(user._id);

    const [base, cattle, recentCattles] = await Promise.all([

        buildSellerDashboard(user, warnings),

        safely("Cattle statistics",
            () => getFarmerCattleStats(farmerId),
            EMPTY_CATTLE_STATS, warnings),

        safely("Recent cattle",
            () => Cattle.find({ farmer: farmerId })
                .sort({ createdAt: -1 })
                .limit(RECENT_LIMIT)
                .select("breedName category images imageUrl sold createdAt")
                .lean(),
            [], warnings)
    ]);

    return {
        ...base,
        stats: { ...base.stats, cattle },
        recentCattles
    };
};

// Doctors sell vaccines / medicines through the same product flow.
// EXTENSION POINT: when an Appointment / Consultation model exists,
// add its stats here (Promise.all with buildSellerDashboard).
const buildDoctorDashboard = (user, warnings) =>
    buildSellerDashboard(user, warnings);

// "buyer" and "user" are both customers, so they share one builder.
const buildBuyerDashboard = async (user, warnings) => {

    const userId = toObjectId(user._id);

    const [orders, cart, recentOrders, recommendedProducts] = await Promise.all([

        safely("Order statistics",
            () => getBuyerOrderStats(userId),
            EMPTY_BUYER_STATS, warnings),

        safely("Cart summary",
            () => getCartSummary(userId),
            EMPTY_CART, warnings),

        safely("Recent orders",
            () => getBuyerRecentOrders(userId),
            [], warnings),

        safely("Recommended products",
            () => getRecommendedProducts(),
            [], warnings)
    ]);

    return {
        stats: { orders, cart },
        recentOrders,
        recommendedProducts,
        alerts: []
    };
};

const DASHBOARD_BUILDERS = Object.freeze({
    [ROLES.FARMER]: buildFarmerDashboard,
    [ROLES.DOCTOR]: buildDoctorDashboard,
    [ROLES.BUYER]: buildBuyerDashboard,
    [ROLES.USER]: buildBuyerDashboard
});


/* =========================================================
   CORE LOADER
========================================================= */
const loadDashboardData = async (user) => {

    const role = user.role?.toLowerCase();
    const builder = DASHBOARD_BUILDERS[role];

    if (!builder) {
        throw new ApiError(403, "No dashboard is available for this account type.");
    }

    const warnings = [];
    const data = await builder(user, warnings);

    return { ...data, warnings };
};


/* =========================================================
   PAGE HANDLER FACTORY
   Wrong role  -> redirected to own dashboard (no data loaded)
   Not logged in -> redirected to login
========================================================= */
const createDashboardPage = (role) =>
    asyncHandler(async (req, res) => {

        if (!req.user) {
            return res.redirect("/login");
        }

        const userRole = req.user.role?.toLowerCase();

        if (userRole !== role) {

            const home = ROLE_HOME[userRole];

            if (!home) {
                throw new ApiError(403, "You are not allowed to access this dashboard.");
            }

            return res.redirect(home);
        }

        const data = await loadDashboardData(req.user);

        // Dashboards contain private business data: never cache
        res.set("Cache-Control", "no-store");

        return res.status(200).render(DASHBOARD_VIEW[role], {
            title: DASHBOARD_TITLE[role],
            user: toSafeUser(req.user),
            role,
            ...data,
            success: readFlash(req.query.success),
            error: readFlash(req.query.error)
        });
    });


/* =========================================================
   EXPORTED PAGE HANDLERS
========================================================= */
const farmerDashboard = createDashboardPage(ROLES.FARMER);
const doctorDashboard = createDashboardPage(ROLES.DOCTOR);
const buyerDashboard = createDashboardPage(ROLES.BUYER);
const userDashboard = createDashboardPage(ROLES.USER);

// GET /dashboard  -> "user" role sees their dashboard,
// every other role is redirected to their own home.
const dashboardHome = userDashboard;


/* =========================================================
   JSON ENDPOINT (charts refresh / mobile app)
   GET /api/v1/dashboard/data
========================================================= */
const getDashboardData = asyncHandler(async (req, res) => {

    if (!req.user) {
        throw new ApiError(401, "Please login to continue.");
    }

    const data = await loadDashboardData(req.user);

    res.set("Cache-Control", "no-store");

    return res.status(200).json(
        new ApiResponse(
            200,
            { role: req.user.role.toLowerCase(), ...data },
            "Dashboard data fetched successfully"
        )
    );
});


export {
    dashboardHome,
    farmerDashboard,
    doctorDashboard,
    buyerDashboard,
    userDashboard,
    getDashboardData
};


