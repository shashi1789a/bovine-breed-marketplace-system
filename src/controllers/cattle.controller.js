import {
    Cattle,
    CATTLE_CATEGORIES,
    CATTLE_MANAGER_ROLES,
    MAX_CATTLE_IMAGES
} from "../models/cattle.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const ADMIN_ROLE = "admin";
const CATTLE_HOME = "/farmer/cattle";
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;
const MAX_PAGE = 10000;
const MAX_KEYWORD_LENGTH = 100;
const MAX_FLASH_LENGTH = 200;

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const FARMER_PUBLIC_FIELDS = "fullName username role avatar farmerDetails";

const LISTING_FIELDS = [
    "breedName",
    "name",
    "category",
    "breedType",
    "color",
    "bodySize",
    "gender",
    "age",
    "weight",
    "price",
    "images",
    "imageUrl",
    "originState",
    "avgMilkPerDay",
    "avgMarketPrice",
    "sold",
    "isActive",
    "farmer",
    "createdAt"
].join(" ");

const SORT_OPTIONS = Object.freeze({
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    price_asc: { price: 1, _id: 1 },
    price_desc: { price: -1, _id: 1 },
    milk_desc: { avgMilkPerDay: -1, _id: 1 }
});

const PROTECTED_FIELDS = new Set([
    "_id",
    "__v",
    "createdAt",
    "updatedAt",
    "farmer",
    "buyer",
    "soldAt",
    "isDeleted",
    "deletedAt",
    "images",
    "imageUrl"
]);

const EDITABLE_FIELDS = Object.freeze(
    Object.fromEntries(
        Object.keys(Cattle.schema.paths)
            .filter((path) => !PROTECTED_FIELDS.has(path))
            .map((path) => [path, Cattle.schema.path(path).instance])
    )
);

const BREED_TYPES = Cattle.schema.path("breedType").enumValues;

const label = (field) =>
    field
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (char) => char.toUpperCase());

const isObjectId = (value) =>
    typeof value === "string" && OBJECT_ID_PATTERN.test(value);

const lastValue = (value) =>
    Array.isArray(value) ? value[value.length - 1] : value;

const readText = (value) => {
    const raw = lastValue(value);

    if (typeof raw === "number") return String(raw);
    if (typeof raw !== "string") return null;

    return raw.trim();
};

const toBoolean = (value) =>
    ["on", "true", "1", "yes"].includes(String(lastValue(value)).toLowerCase());

const toList = (value) => {
    if (typeof value === "string") return value ? [value] : [];
    if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item);
    return [];
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const clampInt = (value, fallback, min, max) => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(Math.max(parsed, min), max);
};

const queryString = (value, max = 200) =>
    typeof value === "string" ? value.trim().slice(0, max) : "";

const queryNumber = (value) => {
    if (typeof value !== "string" || !value.trim()) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const matchOption = (values, raw) => {
    const normalized = queryString(raw).toLowerCase();
    return values.find((item) => item.toLowerCase() === normalized) || "";
};

const readFlash = (value) =>
    typeof value === "string" && value.trim()
        ? value.trim().slice(0, MAX_FLASH_LENGTH)
        : null;

const safeRedirect = (target, fallback) =>
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\") &&
    !/[\r\n]/.test(target)
        ? target
        : fallback;

const wantsJson = (req) =>
    Boolean(req.xhr) || req.accepts(["html", "json"]) === "json";

const respond = (req, res, { status = 200, redirectTo, data = {}, message }) => {
    if (wantsJson(req)) {
        return res.status(status).json(new ApiResponse(status, data, message));
    }

    const separator = redirectTo.includes("?") ? "&" : "?";

    return res.redirect(
        `${redirectTo}${separator}success=${encodeURIComponent(message)}`
    );
};

const requireCattleManager = (req) => {
    if (!req.user) {
        throw new ApiError(401, "Please login to continue.");
    }

    const role = req.user.role?.toLowerCase();

    if (!CATTLE_MANAGER_ROLES.includes(role)) {
        throw new ApiError(403, "You are not authorized to manage cattle.");
    }
};

const toClientError = (error) => {
    if (error instanceof ApiError) {
        return { status: error.statusCode || 500, message: error.message };
    }

    if (error?.name === "ValidationError") {
        return {
            status: 400,
            message: Object.values(error.errors)
                .map((item) => item.message)
                .join(" ")
        };
    }

    if (error?.name === "CastError") {
        return { status: 400, message: `Invalid value for ${label(error.path)}.` };
    }

    return null;
};

const renderForm = (req, res, view, options = {}) => {
    const {
        status = 200,
        title,
        error = null,
        formData = {},
        cattle = null
    } = options;

    return res.status(status).render(view, {
        title,
        user: req.user,
        cattle,
        categories: CATTLE_CATEGORIES,
        formData,
        error,
        success: null
    });
};

const rejectForm = (req, res, view, options) => {
    if (wantsJson(req)) {
        throw new ApiError(options.status || 400, options.error);
    }

    return renderForm(req, res, view, options);
};

const missing = (req, res, status, message) => {
    if (wantsJson(req)) {
        throw new ApiError(status, message);
    }

    return res.status(status).render("404", { title: message, user: req.user });
};

const parseCattleInput = (body) => {
    const source = body && typeof body === "object" ? body : {};
    const data = {};
    const errors = [];

    for (const [field, type] of Object.entries(EDITABLE_FIELDS)) {
        if (source[field] === undefined) continue;

        const raw = lastValue(source[field]);

        if (type === "Boolean") {
            data[field] = toBoolean(raw);
            continue;
        }

        if (type === "Number") {
            const text = typeof raw === "string" ? raw.trim() : raw;

            if (text === "" || text === null) {
                data[field] = undefined;
                continue;
            }

            const value =
                typeof text === "number"
                    ? text
                    : typeof text === "string"
                        ? Number(text)
                        : Number.NaN;

            if (!Number.isFinite(value)) {
                errors.push(`${label(field)} must be a valid number.`);
                continue;
            }

            data[field] = value;
            continue;
        }

        if (type === "String") {
            const value = readText(raw);

            if (value === null) {
                errors.push(`${label(field)} is invalid.`);
                continue;
            }

            data[field] = value || undefined;
        }
    }

    return { data, errors };
};

const collectFiles = (req) => {
    if (Array.isArray(req.files)) return req.files;
    if (req.files?.images) return req.files.images;
    return req.file ? [req.file] : [];
};

const uploadFiles = (files) =>
    Promise.all(
        files.map(async (file) => {
            const uploaded = await uploadOnCloudinary(file.path);
            const url = uploaded?.secure_url || uploaded?.url;

            if (!url) {
                throw new ApiError(502, "Image upload failed. Please try again.");
            }

            return url;
        })
    );

const assertImageLimit = (count) => {
    if (count > MAX_CATTLE_IMAGES) {
        throw new ApiError(
            400,
            `Cattle can have at most ${MAX_CATTLE_IMAGES} images.`
        );
    }
};

const findOwnedCattle = async (id, userId) => {
    if (!isObjectId(id)) {
        throw new ApiError(400, "Invalid cattle id");
    }

    const cattle = await Cattle.findOne({ _id: id, farmer: userId });

    if (!cattle) {
        throw new ApiError(404, "Cattle not found");
    }

    return cattle;
};

const buildFilterConditions = (query) => {
    const conditions = [];

    const category = matchOption(CATTLE_CATEGORIES, query.category);
    const breedType = matchOption(BREED_TYPES, query.breedType);
    const originState = queryString(query.originState, MAX_KEYWORD_LENGTH);
    const keyword = queryString(query.q ?? query.keyword, MAX_KEYWORD_LENGTH);
    const minPrice = queryNumber(query.minPrice);
    const maxPrice = queryNumber(query.maxPrice);
    const sold = query.sold === "true" || query.sold === "false" ? query.sold : "";

    if (category) conditions.push({ category });
    if (breedType) conditions.push({ breedType });
    if (sold) conditions.push({ sold: sold === "true" });

    if (originState) {
        conditions.push({
            originState: new RegExp(escapeRegExp(originState), "i")
        });
    }

    if (keyword) {
        const pattern = new RegExp(escapeRegExp(keyword), "i");

        conditions.push({
            $or: [
                { breedName: pattern },
                { name: pattern },
                { scientificName: pattern },
                { originState: pattern },
                { originCountry: pattern }
            ]
        });
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
        const range = {};
        if (minPrice !== undefined) range.$gte = minPrice;
        if (maxPrice !== undefined) range.$lte = maxPrice;
        conditions.push({ price: range });
    }

    return {
        conditions,
        filters: {
            q: keyword,
            category,
            breedType,
            originState,
            minPrice: minPrice ?? "",
            maxPrice: maxPrice ?? "",
            sold
        }
    };
};

const runListing = async ({ baseConditions, query }) => {
    const page = clampInt(query.page, 1, 1, MAX_PAGE);
    const limit = clampInt(query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    const requestedSort = queryString(query.sort);
    const sort = Object.prototype.hasOwnProperty.call(SORT_OPTIONS, requestedSort)
        ? requestedSort
        : "newest";

    const { conditions, filters } = buildFilterConditions(query);
    const filter = { $and: [...baseConditions, ...conditions] };

    const [cattle, total] = await Promise.all([
        Cattle.find(filter)
            .select(LISTING_FIELDS)
            .populate("farmer", FARMER_PUBLIC_FIELDS)
            .sort(SORT_OPTIONS[sort])
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Cattle.countDocuments(filter)
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        cattle,
        total,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        },
        filters: { ...filters, sort }
    };
};

const showAddCattlePage = asyncHandler(async (req, res) => {
    requireCattleManager(req);

    return renderForm(req, res, "farmer/cattle/create", { title: "Add Cattle" });
});

const showEditCattlePage = asyncHandler(async (req, res) => {
    requireCattleManager(req);

    const cattle = await findOwnedCattle(req.params.id, req.user._id);

    return renderForm(req, res, "farmer/cattle/edit", {
        title: "Edit Cattle",
        cattle: cattle.toObject()
    });
});

const addCattle = asyncHandler(async (req, res) => {
    requireCattleManager(req);

    const { data, errors } = parseCattleInput(req.body);

    if (errors.length) {
        return rejectForm(req, res, "farmer/cattle/create", {
            status: 400,
            title: "Add Cattle",
            error: errors.join(" "),
            formData: req.body
        });
    }

    let cattle;

    try {
        const files = collectFiles(req);
        assertImageLimit(files.length);

        const images = await uploadFiles(files);

        cattle = await Cattle.create({
            ...data,
            images,
            farmer: req.user._id
        });
    } catch (error) {
        const clientError = toClientError(error);

        if (!clientError) throw error;

        return rejectForm(req, res, "farmer/cattle/create", {
            status: clientError.status,
            title: "Add Cattle",
            error: clientError.message,
            formData: req.body
        });
    }

    return respond(req, res, {
        status: 201,
        redirectTo: CATTLE_HOME,
        data: cattle,
        message: "Cattle added successfully"
    });
});

const listCattle = asyncHandler(async (req, res) => {
    requireCattleManager(req);

    const listing = await runListing({
        baseConditions: [{ farmer: req.user._id }],
        query: req.query
    });

    if (wantsJson(req)) {
        return res.status(200).json(
            new ApiResponse(
                200,
                {
                    totalCattle: listing.total,
                    cattleList: listing.cattle,
                    pagination: listing.pagination,
                    filters: listing.filters
                },
                "Cattle fetched successfully"
            )
        );
    }

    return res.status(200).render("farmer/cattle/index", {
        title: "My Cattle",
        user: req.user,
        cattles: listing.cattle,
        totalCattles: listing.total,
        pagination: listing.pagination,
        filters: listing.filters,
        categories: CATTLE_CATEGORIES,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const getCattleById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    if (!isObjectId(id)) {
        return missing(req, res, 400, "Invalid cattle id");
    }

    const cattle = await Cattle.findById(id)
        .populate("farmer", FARMER_PUBLIC_FIELDS)
        .lean();

    if (!cattle) {
        return missing(req, res, 404, "Cattle not found");
    }

    const isOwner =
        Boolean(req.user?._id) &&
        String(cattle.farmer?._id ?? "") === String(req.user._id);

    const isAdmin = req.user?.role?.toLowerCase() === ADMIN_ROLE;

    if (!isOwner && !isAdmin) {
        if (!cattle.isActive) {
            return missing(req, res, 404, "Cattle not found");
        }

        delete cattle.buyer;
        delete cattle.isDeleted;
        delete cattle.deletedAt;
    }

    if (wantsJson(req)) {
        return res
            .status(200)
            .json(new ApiResponse(200, cattle, "Cattle fetched successfully"));
    }

    return res.status(200).render("farmer/cattle/show", {
        title: cattle.name || cattle.breedName,
        user: req.user,
        cattle,
        isOwner,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const updateCattle = asyncHandler(async (req, res) => {
    requireCattleManager(req);

    const cattle = await findOwnedCattle(req.params.id, req.user._id);

    const { data, errors } = parseCattleInput(req.body);

    if (errors.length) {
        return rejectForm(req, res, "farmer/cattle/edit", {
            status: 400,
            title: "Edit Cattle",
            error: errors.join(" "),
            formData: req.body,
            cattle: cattle.toObject()
        });
    }

    try {
        const current = cattle.images || [];
        const removal = new Set(toList(req.body?.removeImages));
        const kept = current.filter((url) => !removal.has(url));
        const files = collectFiles(req);

        assertImageLimit(kept.length + files.length);

        const uploaded = await uploadFiles(files);

        for (const [field, value] of Object.entries(data)) {
            cattle.set(field, value);
        }

        if (uploaded.length || kept.length !== current.length) {
            cattle.images = [...kept, ...uploaded];
        }

        await cattle.save();
    } catch (error) {
        const clientError = toClientError(error);

        if (!clientError) throw error;

        return rejectForm(req, res, "farmer/cattle/edit", {
            status: clientError.status,
            title: "Edit Cattle",
            error: clientError.message,
            formData: req.body,
            cattle: cattle.toObject()
        });
    }

    return respond(req, res, {
        redirectTo: `${CATTLE_HOME}/${cattle._id}`,
        data: cattle,
        message: "Cattle updated successfully"
    });
});

const deleteCattle = asyncHandler(async (req, res) => {
    requireCattleManager(req);

    const cattle = await findOwnedCattle(req.params.id, req.user._id);

    await Cattle.updateOne(
        { _id: cattle._id },
        {
            $set: {
                isDeleted: true,
                isActive: false,
                deletedAt: new Date()
            }
        }
    );

    return respond(req, res, {
        redirectTo: safeRedirect(req.body?.redirect, CATTLE_HOME),
        data: {},
        message: "Cattle deleted successfully"
    });
});

const getAllCattle = asyncHandler(async (req, res) => {
    const listing = await runListing({
        baseConditions: [{ isActive: true, sold: false }],
        query: { ...req.query, sold: undefined }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                totalCattle: listing.total,
                cattle: listing.cattle,
                pagination: listing.pagination,
                filters: listing.filters
            },
            "All cattle fetched successfully"
        )
    );
});

export {
    addCattle,
    showAddCattlePage,
    showEditCattlePage,
    listCattle,
    getCattleById,
    updateCattle,
    deleteCattle,
    getAllCattle
};