import { User, USER_ROLES } from "../models/user.model.js";
import {
    Product,
    APPROVAL_STATUS,
    PRODUCT_CATEGORIES
} from "../models/product.model.js";
import { Order } from "../models/order.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { wantsJson } from "../utils/session.js";

const ADMIN_ROLE = "admin";
const USERS_HOME = "/admin/users";
const PRODUCTS_HOME = "/admin/products";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_PAGE = 10000;
const MAX_KEYWORD_LENGTH = 100;
const MAX_FLASH_LENGTH = 200;
const RECENT_LIMIT = 5;
const MIN_REASON_LENGTH = 3;
const MAX_REASON_LENGTH = 500;

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const ORDER_STATUS = Object.freeze({
    PENDING: "Pending",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled"
});

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const isObjectId = (value) =>
    typeof value === "string" && OBJECT_ID_PATTERN.test(value);

const readText = (value) => (typeof value === "string" ? value.trim() : "");

const queryString = (value, max = 200) => readText(value).slice(0, max);

const readFlash = (value) => queryString(value, MAX_FLASH_LENGTH) || null;

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clampInt = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const toBoolean = (value) => {
    const raw = Array.isArray(value) ? value[value.length - 1] : value;
    return ["on", "true", "1", "yes"].includes(String(raw).toLowerCase());
};

const matchOption = (values, raw) => {
    const normalized = queryString(raw).toLowerCase();
    return values.find((item) => item.toLowerCase() === normalized) || "";
};

const safeRedirect = (target, fallback) =>
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\") &&
    !/[\r\n]/.test(target)
        ? target
        : fallback;

const countIf = (condition) => ({ $sum: { $cond: [condition, 1, 0] } });

const readId = (req) => {
    if (!isObjectId(req.params.id)) {
        throw new ApiError(400, "Invalid id");
    }

    return req.params.id;
};

const paging = (query) => {
    const page = clampInt(query.page, 1, 1, MAX_PAGE);
    const limit = clampInt(query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    return { page, limit, skip: (page - 1) * limit };
};

const buildPagination = (page, limit, total) => {
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
    };
};

const present = (req, res, { view, title, data, message }) => {
    if (wantsJson(req)) {
        return res.status(200).json(new ApiResponse(200, data, message));
    }

    return res.status(200).render(view, {
        title,
        user: req.user,
        ...data,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
};

const done = (req, res, { redirectTo, data = {}, message }) => {
    if (wantsJson(req)) {
        return res.status(200).json(new ApiResponse(200, data, message));
    }

    const target = safeRedirect(req.body?.redirect, redirectTo);
    const separator = target.includes("?") ? "&" : "?";

    return res.redirect(`${target}${separator}success=${encodeURIComponent(message)}`);
};

const assertAnotherAdminExists = async (excludedId) => {
    const others = await User.countDocuments({
        role: ADMIN_ROLE,
        isActive: { $ne: false },
        _id: { $ne: excludedId }
    });

    if (others < 1) {
        throw new ApiError(400, "At least one active admin is required.");
    }
};

const adminDashboard = asyncHandler(async (req, res) => {
    const [userRows, productRows, orderRows, pendingProducts, recentUsers] =
        await Promise.all([
            User.aggregate([
                {
                    $group: {
                        _id: "$role",
                        total: { $sum: 1 },
                        active: countIf({ $ne: ["$isActive", false] })
                    }
                },
                { $sort: { _id: 1 } }
            ]),

            Product.aggregate([
                { $group: { _id: "$approvalStatus", count: { $sum: 1 } } }
            ]),

            Order.aggregate([
                { $match: { orderStatus: { $ne: ORDER_STATUS.PENDING } } },
                {
                    $group: {
                        _id: null,
                        totalOrders: { $sum: 1 },
                        deliveredOrders: countIf({ $eq: ["$orderStatus", ORDER_STATUS.DELIVERED] }),
                        cancelledOrders: countIf({ $eq: ["$orderStatus", ORDER_STATUS.CANCELLED] }),
                        revenue: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $ne: ["$orderStatus", ORDER_STATUS.CANCELLED] },
                                            {
                                                $or: [
                                                    { $eq: ["$paymentStatus", "Paid"] },
                                                    { $eq: ["$orderStatus", ORDER_STATUS.DELIVERED] }
                                                ]
                                            }
                                        ]
                                    },
                                    { $ifNull: ["$totalAmount", 0] },
                                    0
                                ]
                            }
                        }
                    }
                }
            ]),

            Product.find({ approvalStatus: APPROVAL_STATUS.PENDING })
                .sort({ createdAt: -1 })
                .limit(RECENT_LIMIT)
                .select("name image price category ownerRole owner createdAt")
                .populate("owner", "fullName username")
                .lean(),

            User.find()
                .sort({ createdAt: -1 })
                .limit(RECENT_LIMIT)
                .select("fullName username email role avatar isActive createdAt")
                .lean()
        ]);

    const productCount = (status) =>
        productRows.find((row) => row._id === status)?.count || 0;

    const { _id, ...orderTotals } = orderRows[0] || {};

    const stats = {
        users: {
            total: userRows.reduce((sum, row) => sum + row.total, 0),
            active: userRows.reduce((sum, row) => sum + row.active, 0),
            byRole: userRows.map((row) => ({
                role: row._id,
                total: row.total,
                active: row.active
            }))
        },
        products: {
            total: productRows.reduce((sum, row) => sum + row.count, 0),
            pending: productCount(APPROVAL_STATUS.PENDING),
            approved: productCount(APPROVAL_STATUS.APPROVED),
            rejected: productCount(APPROVAL_STATUS.REJECTED)
        },
        orders: {
            totalOrders: 0,
            deliveredOrders: 0,
            cancelledOrders: 0,
            ...orderTotals,
            revenue: round2(orderTotals.revenue)
        }
    };

    return present(req, res, {
        view: "dashboard/adminDashboard",
        title: "Admin Dashboard",
        data: { stats, pendingProducts, recentUsers },
        message: "Admin dashboard fetched successfully"
    });
});

const listUsers = asyncHandler(async (req, res) => {
    const { page, limit, skip } = paging(req.query);

    const role = matchOption(USER_ROLES, req.query.role);
    const status = queryString(req.query.status).toLowerCase();
    const keyword = queryString(req.query.q, MAX_KEYWORD_LENGTH);

    const conditions = [];

    if (role) conditions.push({ role });
    if (status === "active") conditions.push({ isActive: { $ne: false } });
    if (status === "inactive") conditions.push({ isActive: false });

    if (keyword) {
        const pattern = new RegExp(escapeRegExp(keyword), "i");

        conditions.push({
            $or: [{ fullName: pattern }, { username: pattern }, { email: pattern }]
        });
    }

    const filter = conditions.length ? { $and: conditions } : {};

    const [users, total] = await Promise.all([
        User.find(filter)
            .select("fullName username email role avatar isActive lastLoginAt createdAt")
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        User.countDocuments(filter)
    ]);

    return present(req, res, {
        view: "admin/users",
        title: "Manage Users",
        data: {
            users,
            totalUsers: total,
            pagination: buildPagination(page, limit, total),
            filters: { role, status, q: keyword },
            roles: USER_ROLES
        },
        message: "Users fetched successfully"
    });
});

const updateUserRole = asyncHandler(async (req, res) => {
    const id = readId(req);
    const role = matchOption(USER_ROLES, req.body?.role);

    if (!role) {
        throw new ApiError(400, "Invalid role");
    }

    if (String(req.user._id) === id) {
        throw new ApiError(400, "You cannot change your own role.");
    }

    const target = await User.findById(id).select("role");

    if (!target) {
        throw new ApiError(404, "User not found");
    }

    if (target.role === ADMIN_ROLE && role !== ADMIN_ROLE) {
        await assertAnotherAdminExists(id);
    }

    await User.updateOne({ _id: id }, { $set: { role } });

    return done(req, res, {
        redirectTo: USERS_HOME,
        data: { id, role },
        message: "User role updated successfully"
    });
});

const updateUserStatus = asyncHandler(async (req, res) => {
    const id = readId(req);

    if (req.body?.isActive === undefined) {
        throw new ApiError(400, "isActive is required");
    }

    const isActive = toBoolean(req.body.isActive);

    if (String(req.user._id) === id) {
        throw new ApiError(400, "You cannot change your own account status.");
    }

    const target = await User.findById(id).select("role");

    if (!target) {
        throw new ApiError(404, "User not found");
    }

    if (!isActive && target.role === ADMIN_ROLE) {
        await assertAnotherAdminExists(id);
    }

    await User.updateOne({ _id: id }, { $set: { isActive } });

    if (!isActive) {
        await User.removeAllSessions(id);
    }

    return done(req, res, {
        redirectTo: USERS_HOME,
        data: { id, isActive },
        message: isActive ? "User activated successfully" : "User deactivated successfully"
    });
});

const listProducts = asyncHandler(async (req, res) => {
    const { page, limit, skip } = paging(req.query);

    const status = matchOption(Object.values(APPROVAL_STATUS), req.query.status);
    const category = matchOption(PRODUCT_CATEGORIES, req.query.category);
    const keyword = queryString(req.query.q, MAX_KEYWORD_LENGTH);

    const conditions = [];

    if (status) conditions.push({ approvalStatus: status });
    if (category) conditions.push({ category });

    if (keyword) {
        const pattern = new RegExp(escapeRegExp(keyword), "i");
        conditions.push({ $or: [{ name: pattern }, { brand: pattern }] });
    }

    const filter = conditions.length ? { $and: conditions } : {};

    const [products, total, pendingCount] = await Promise.all([
        Product.find(filter)
            .select({ reviews: 0 })
            .populate("owner", "fullName username email role")
            .sort({ createdAt: -1, _id: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Product.countDocuments(filter),
        Product.countDocuments({ approvalStatus: APPROVAL_STATUS.PENDING })
    ]);

    return present(req, res, {
        view: "admin/products",
        title: "Manage Products",
        data: {
            products,
            totalProducts: total,
            pendingCount,
            pagination: buildPagination(page, limit, total),
            filters: { status, category, q: keyword },
            statuses: Object.values(APPROVAL_STATUS),
            categories: PRODUCT_CATEGORIES
        },
        message: "Products fetched successfully"
    });
});

const approveProduct = asyncHandler(async (req, res) => {
    const id = readId(req);

    const product = await Product.findOneAndUpdate(
        { _id: id },
        {
            $set: {
                approvalStatus: APPROVAL_STATUS.APPROVED,
                approvedBy: req.user._id,
                approvedAt: new Date()
            },
            $unset: { rejectionReason: "" }
        },
        { new: true }
    );

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    return done(req, res, {
        redirectTo: PRODUCTS_HOME,
        data: { id, approvalStatus: product.approvalStatus },
        message: "Product approved successfully"
    });
});

const rejectProduct = asyncHandler(async (req, res) => {
    const id = readId(req);
    const reason = readText(req.body?.reason);

    if (reason.length < MIN_REASON_LENGTH || reason.length > MAX_REASON_LENGTH) {
        throw new ApiError(
            400,
            `Rejection reason must be ${MIN_REASON_LENGTH}-${MAX_REASON_LENGTH} characters.`
        );
    }

    const product = await Product.findOneAndUpdate(
        { _id: id },
        {
            $set: {
                approvalStatus: APPROVAL_STATUS.REJECTED,
                rejectionReason: reason
            },
            $unset: { approvedBy: "", approvedAt: "" }
        },
        { new: true }
    );

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    return done(req, res, {
        redirectTo: PRODUCTS_HOME,
        data: { id, approvalStatus: product.approvalStatus },
        message: "Product rejected successfully"
    });
});

const setProductFeatured = asyncHandler(async (req, res) => {
    const id = readId(req);

    if (req.body?.featured === undefined) {
        throw new ApiError(400, "featured is required");
    }

    const featured = toBoolean(req.body.featured);

    const filter = featured
        ? { _id: id, approvalStatus: APPROVAL_STATUS.APPROVED }
        : { _id: id };

    const product = await Product.findOneAndUpdate(
        filter,
        { $set: { featured } },
        { new: true }
    );

    if (!product) {
        throw new ApiError(
            404,
            featured ? "Approved product not found" : "Product not found"
        );
    }

    return done(req, res, {
        redirectTo: PRODUCTS_HOME,
        data: { id, featured },
        message: featured ? "Product featured successfully" : "Product unfeatured successfully"
    });
});

const deleteProductByAdmin = asyncHandler(async (req, res) => {
    const id = readId(req);

    const product = await Product.findById(id).select("slug");

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    await Product.updateOne(
        { _id: product._id },
        {
            $set: {
                isDeleted: true,
                isActive: false,
                featured: false,
                deletedAt: new Date(),
                slug: `${product.slug || "product"}-deleted-${Date.now().toString(36)}`
            },
            $unset: { sku: "" }
        }
    );

    return done(req, res, {
        redirectTo: PRODUCTS_HOME,
        data: { id },
        message: "Product deleted successfully"
    });
});

export {
    adminDashboard,
    listUsers,
    updateUserRole,
    updateUserStatus,
    listProducts,
    approveProduct,
    rejectProduct,
    setProductFeatured,
    deleteProductByAdmin
};