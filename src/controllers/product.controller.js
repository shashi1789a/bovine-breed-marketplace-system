import {
    Product,
    PRODUCT_CATEGORIES,
    APPROVAL_STATUS,
    SELLER_ROLES,
    MAX_GALLERY_IMAGES
} from "../models/product.model.js";

import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";

const ADMIN_ROLE = "admin";
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 48;
const MAX_PAGE = 10000;
const MAX_KEYWORD_LENGTH = 100;
const MAX_TAGS = 20;
const MAX_TAG_LENGTH = 40;
const MAX_REVIEWS_SHOWN = 20;

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

const productsHome = (role) => `/${role}/products`;

const SORT_OPTIONS = Object.freeze({
    newest: { createdAt: -1, _id: -1 },
    oldest: { createdAt: 1, _id: 1 },
    price_asc: { price: 1, _id: 1 },
    price_desc: { price: -1, _id: 1 },
    popular: { soldCount: -1, views: -1, _id: 1 },
    rating: { ratings: -1, numOfReviews: -1, _id: 1 }
});

const PRIVATE_FIELDS = Object.freeze([
    "sku",
    "barcode",
    "approvedBy",
    "approvedAt",
    "rejectionReason",
    "isDeleted",
    "deletedAt"
]);

const LISTING_PROJECTION = Object.freeze({
    reviews: 0,
    sku: 0,
    barcode: 0,
    approvedBy: 0,
    approvedAt: 0,
    rejectionReason: 0,
    isDeleted: 0,
    deletedAt: 0,
    "seller.phone": 0,
    "seller.address": 0
});

const REAPPROVAL_FIELDS = Object.freeze([
    "name",
    "description",
    "category",
    "customCategory",
    "brand",
    "expiryDate"
]);

const STRING_FIELDS = Object.freeze({
    name: 200,
    description: 5000,
    shortDescription: 300,
    brand: 120,
    sku: 60,
    barcode: 60,
    customCategory: 100,
    subCategory: 100,
    unit: 30,
    weightUnit: 10,
    color: 50,
    size: 50,
    flavor: 50,
    deliveryTime: 100
});

const NON_CLEARABLE_FIELDS = Object.freeze(["unit", "weightUnit"]);

const REQUIRED_FIELDS = Object.freeze(["name", "description", "price", "category"]);

const NUMBER_FIELDS = Object.freeze({
    price: { min: 0.01 },
    mrp: { min: 0 },
    tax: { min: 0, max: 100, empty: 0 },
    stock: { min: 0, integer: true, empty: 0 },
    minStock: { min: 0, integer: true, empty: 0 },
    weight: { min: 0 },
    shippingCharge: { min: 0, empty: 0 }
});

const DATE_FIELDS = Object.freeze(["manufactureDate", "expiryDate"]);

const SELLER_FIELDS = Object.freeze({
    sellerName: { path: "name", max: 120 },
    sellerPhone: { path: "phone", max: 20 },
    sellerAddress: { path: "address", max: 300 }
});

const label = (field) =>
    field.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase());

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

const matchCategory = (value) => {
    const normalized = value.toLowerCase().replace(/[-_]+/g, " ").trim();
    return PRODUCT_CATEGORIES.find((item) => item.toLowerCase() === normalized) || null;
};

const safeRedirect = (target, fallback) =>
    typeof target === "string" &&
    target.startsWith("/") &&
    !target.startsWith("//") &&
    !target.startsWith("/\\") &&
    !/[\r\n]/.test(target)
        ? target
        : fallback;

const isFormRequest = (req) =>
    Boolean(req.is(["application/x-www-form-urlencoded", "multipart/form-data"]));

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

const requireSellerRole = (req) => {
    if (!req.user) {
        throw new ApiError(401, "Please login to continue.");
    }

    const role = req.user.role?.toLowerCase();

    if (!SELLER_ROLES.includes(role)) {
        throw new ApiError(403, "You are not authorized to manage products.");
    }

    return role;
};

const defaultSellerAddress = (user) =>
    user.farmerDetails?.location || user.buyerDetails?.address;

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

    if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern || error.keyValue || {})[0];
        return {
            status: 409,
            message: `${field ? label(field) : "Value"} already exists.`
        };
    }

    return null;
};

const renderForm = (req, res, view, options = {}) => {
    const {
        status = 200,
        title,
        error = null,
        formData = {},
        product = null
    } = options;

    return res.status(status).render(view, {
        title,
        user: req.user,
        product,
        categories: PRODUCT_CATEGORIES,
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

const readTags = (value) => {
    const source = Array.isArray(value) ? value : String(value ?? "").split(",");

    const tags = source
        .filter((item) => typeof item === "string")
        .flatMap((item) => item.split(","))
        .map((item) => item.trim().toLowerCase().slice(0, MAX_TAG_LENGTH))
        .filter(Boolean);

    return [...new Set(tags)].slice(0, MAX_TAGS);
};

const parseProductInput = (body, { isForm, isAdmin, isCreate }) => {
    const source = body && typeof body === "object" ? body : {};
    const data = {};
    const seller = {};
    const errors = [];
    const failed = new Set();

    const provided = (key) => source[key] !== undefined;

    const fail = (field, message) => {
        failed.add(field);
        errors.push(message);
    };

    for (const [field, max] of Object.entries(STRING_FIELDS)) {
        if (!provided(field)) continue;

        const value = readText(source[field]);

        if (value === null) {
            fail(field, `${label(field)} is invalid.`);
            continue;
        }

        if (value.length > max) {
            fail(field, `${label(field)} cannot exceed ${max} characters.`);
            continue;
        }

        if (!value && NON_CLEARABLE_FIELDS.includes(field)) continue;

        data[field] = value || undefined;
    }

    for (const [field, rules] of Object.entries(NUMBER_FIELDS)) {
        if (!provided(field)) continue;

        const raw = lastValue(source[field]);
        const text = typeof raw === "string" ? raw.trim() : raw;

        if (text === "" || text === null) {
            data[field] = rules.empty;
            continue;
        }

        const value = typeof text === "number" ? text : Number(text);

        if (!Number.isFinite(value) || typeof text === "boolean") {
            fail(field, `${label(field)} must be a valid number.`);
            continue;
        }

        if (rules.integer && !Number.isInteger(value)) {
            fail(field, `${label(field)} must be a whole number.`);
            continue;
        }

        if (value < rules.min) {
            fail(field, `${label(field)} cannot be less than ${rules.min}.`);
            continue;
        }

        if (rules.max !== undefined && value > rules.max) {
            fail(field, `${label(field)} cannot be greater than ${rules.max}.`);
            continue;
        }

        data[field] = value;
    }

    for (const field of DATE_FIELDS) {
        if (!provided(field)) continue;

        const raw = lastValue(source[field]);
        const text = typeof raw === "string" ? raw.trim() : raw;

        if (text === "" || text === null) {
            data[field] = undefined;
            continue;
        }

        const date = typeof text === "string" ? new Date(text) : null;

        if (!date || Number.isNaN(date.getTime())) {
            fail(field, `${label(field)} is not a valid date.`);
            continue;
        }

        data[field] = date;
    }

    if (provided("category")) {
        const category = matchCategory(readText(source.category) || "");

        if (category) {
            data.category = category;
        } else {
            fail("category", "Invalid category.");
        }
    }

    if (provided("tags")) {
        data.tags = readTags(source.tags);
    }

    for (const [field, { path, max }] of Object.entries(SELLER_FIELDS)) {
        if (!provided(field)) continue;

        const value = readText(source[field]);

        if (value === null || value.length > max) {
            fail(field, `${label(field)} is invalid.`);
            continue;
        }

        seller[path] = value || undefined;
    }

    const flag = (field) => {
        if (provided(field)) return toBoolean(source[field]);
        return isForm ? false : undefined;
    };

    const flags = ["freeShipping", "isActive"];
    if (isAdmin) flags.push("featured");

    for (const field of flags) {
        const value = flag(field);
        if (value !== undefined) data[field] = value;
    }

    for (const field of REQUIRED_FIELDS) {
        if (failed.has(field)) continue;

        const missing = isCreate
            ? data[field] === undefined
            : provided(field) && data[field] === undefined;

        if (missing) {
            errors.push(`${label(field)} is required.`);
        }
    }

    return { data, seller, errors };
};

const uploadFile = async (file) => {
    const uploaded = await uploadOnCloudinary(file.path);
    const url = uploaded?.secure_url || uploaded?.url;

    if (!url) {
        throw new ApiError(502, "Image upload failed. Please try again.");
    }

    return url;
};

const uploadProductImages = async (files) => {
    const main = files?.image?.[0];
    const gallery = files?.images || [];

    if (gallery.length > MAX_GALLERY_IMAGES) {
        throw new ApiError(
            400,
            `A product can have at most ${MAX_GALLERY_IMAGES} gallery images.`
        );
    }

    const [image, images] = await Promise.all([
        main ? uploadFile(main) : undefined,
        Promise.all(gallery.map(uploadFile))
    ]);

    return { image, images };
};

const planGallery = (product, files, removeImages) => {
    const current = product.images || [];
    const removal = new Set(toList(removeImages));
    const kept = current.filter((url) => !removal.has(url));
    const incoming = files?.images?.length || 0;

    if (kept.length + incoming > MAX_GALLERY_IMAGES) {
        throw new ApiError(
            400,
            `A product can have at most ${MAX_GALLERY_IMAGES} gallery images.`
        );
    }

    return { kept, removed: kept.length !== current.length };
};

const findOwnedProduct = async (id, userId) => {
    if (!isObjectId(id)) {
        throw new ApiError(400, "Invalid product id");
    }

    const product = await Product.findOne({ _id: id, owner: userId });

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    return product;
};

const isPubliclyVisible = (product) =>
    product.isActive === true &&
    product.approvalStatus === APPROVAL_STATUS.APPROVED &&
    (!product.expiryDate || new Date(product.expiryDate).getTime() > Date.now());

const recordView = (productId) => {
    Product.updateOne(
        { _id: productId },
        { $inc: { views: 1 } },
        { timestamps: false }
    )
        .exec()
        .catch((error) =>
            console.error("[products] view count failed:", error.message)
        );
};

const loadProductForViewer = async (id, viewer) => {
    if (!isObjectId(id)) return null;

    const product = await Product.findById(id, {
        reviews: { $slice: -MAX_REVIEWS_SHOWN }
    })
        .populate("owner", "fullName username role avatar")
        .lean();

    if (!product) return null;

    const viewerId = viewer?._id ? String(viewer._id) : null;
    const ownerId = product.owner?._id ? String(product.owner._id) : "";
    const isOwner = viewerId !== null && viewerId === ownerId;
    const isAdmin = viewer?.role?.toLowerCase() === ADMIN_ROLE;
    const publiclyVisible = isPubliclyVisible(product);

    if (!isOwner && !isAdmin && !publiclyVisible) return null;

    if (!isOwner && !isAdmin) {
        for (const field of PRIVATE_FIELDS) {
            delete product[field];
        }

        recordView(product._id);
    }

    return product;
};

const publicConditions = () => [Product.publicFilter(), { stock: { $gt: 0 } }];

const buildFilterConditions = (query) => {
    const conditions = [];

    const category = matchCategory(queryString(query.category));

    if (category) {
        conditions.push({ category });
    }

    const keyword = queryString(query.q ?? query.keyword, MAX_KEYWORD_LENGTH);

    if (keyword) {
        const pattern = new RegExp(escapeRegExp(keyword), "i");

        conditions.push({
            $or: [
                { name: pattern },
                { brand: pattern },
                { category: pattern },
                { tags: pattern },
                { description: pattern }
            ]
        });
    }

    const minPrice = queryNumber(query.minPrice);
    const maxPrice = queryNumber(query.maxPrice);

    if (minPrice !== undefined || maxPrice !== undefined) {
        const range = {};
        if (minPrice !== undefined) range.$gte = minPrice;
        if (maxPrice !== undefined) range.$lte = maxPrice;
        conditions.push({ price: range });
    }

    return { conditions, keyword, category, minPrice, maxPrice };
};

const runListing = async ({ baseConditions, query, projection }) => {
    const page = clampInt(query.page, 1, 1, MAX_PAGE);
    const limit = clampInt(query.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);

    const requestedSort = queryString(query.sort);
    const sort = Object.prototype.hasOwnProperty.call(SORT_OPTIONS, requestedSort)
        ? requestedSort
        : "newest";

    const { conditions, keyword, category, minPrice, maxPrice } =
        buildFilterConditions(query);

    const filter = { $and: [...baseConditions, ...conditions] };

    const [products, total] = await Promise.all([
        Product.find(filter)
            .select({ ...projection })
            .populate("owner", "fullName role avatar")
            .sort(SORT_OPTIONS[sort])
            .skip((page - 1) * limit)
            .limit(limit)
            .lean(),
        Product.countDocuments(filter)
    ]);

    const totalPages = Math.max(1, Math.ceil(total / limit));

    return {
        products,
        total,
        pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1
        },
        filters: {
            q: keyword,
            category: category || "",
            minPrice: minPrice ?? "",
            maxPrice: maxPrice ?? "",
            sort
        }
    };
};

const showAddProductPage = asyncHandler(async (req, res) => {
    requireSellerRole(req);

    return renderForm(req, res, "products/add-product", {
        title: "Add Product"
    });
});

const showEditProductPage = asyncHandler(async (req, res) => {
    requireSellerRole(req);

    const product = await findOwnedProduct(req.params.id, req.user._id);

    return renderForm(req, res, "products/edit-product", {
        title: "Edit Product",
        product: product.toObject()
    });
});

const addProduct = asyncHandler(async (req, res) => {
    const role = requireSellerRole(req);
    const isAdmin = role === ADMIN_ROLE;

    const { data, seller, errors } = parseProductInput(req.body, {
        isForm: isFormRequest(req),
        isAdmin,
        isCreate: true
    });

    if (errors.length) {
        return rejectForm(req, res, "products/add-product", {
            status: 400,
            title: "Add Product",
            error: errors.join(" "),
            formData: req.body
        });
    }

    let product;

    try {
        const { image, images } = await uploadProductImages(req.files);

        product = await Product.create({
            ...data,
            seller: {
                name: seller.name ?? req.user.fullName,
                phone: seller.phone,
                address: seller.address ?? defaultSellerAddress(req.user)
            },
            image: image || "",
            images,
            owner: req.user._id,
            ownerRole: role,
            approvalStatus: isAdmin
                ? APPROVAL_STATUS.APPROVED
                : APPROVAL_STATUS.PENDING,
            approvedBy: isAdmin ? req.user._id : null,
            approvedAt: isAdmin ? new Date() : undefined
        });
    } catch (error) {
        const clientError = toClientError(error);

        if (!clientError) throw error;

        return rejectForm(req, res, "products/add-product", {
            status: clientError.status,
            title: "Add Product",
            error: clientError.message,
            formData: req.body
        });
    }

    return respond(req, res, {
        status: 201,
        redirectTo: productsHome(role),
        data: product,
        message: "Product added successfully"
    });
});

const getAllProducts = asyncHandler(async (req, res) => {
    const listing = await runListing({
        baseConditions: publicConditions(),
        query: req.query,
        projection: LISTING_PROJECTION
    });

    return res.render("products/marketplace", {
        title: "Marketplace",
        user: req.user,
        totalProducts: listing.total,
        products: listing.products,
        pagination: listing.pagination,
        filters: listing.filters,
        categories: PRODUCT_CATEGORIES
    });
});

const getMyProducts = asyncHandler(async (req, res) => {
    requireSellerRole(req);

    const baseConditions = [{ owner: req.user._id }];

    const status = queryString(req.query.status).toLowerCase();
    const approval = Object.values(APPROVAL_STATUS).find(
        (value) => value.toLowerCase() === status
    );

    if (approval) {
        baseConditions.push({ approvalStatus: approval });
    }

    const listing = await runListing({
        baseConditions,
        query: req.query,
        projection: { reviews: 0 }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                totalProducts: listing.total,
                products: listing.products,
                pagination: listing.pagination,
                filters: listing.filters
            },
            "My products fetched successfully"
        )
    );
});

const getProductById = asyncHandler(async (req, res) => {
    const product = await loadProductForViewer(req.params.id, req.user);

    if (!product) {
        return res.status(404).render("404", {
            title: "Product Not Found",
            user: req.user
        });
    }

    return res.render("products/product-details", {
        title: product.name,
        user: req.user,
        product
    });
});

const getProductDetails = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) {
        throw new ApiError(400, "Invalid product id");
    }

    const product = await loadProductForViewer(req.params.id, req.user);

    if (!product) {
        throw new ApiError(404, "Product not found");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, product, "Product details fetched successfully"));
});

const updateProduct = asyncHandler(async (req, res) => {
    const role = requireSellerRole(req);
    const isAdmin = role === ADMIN_ROLE;

    const product = await findOwnedProduct(req.params.id, req.user._id);

    const parsed = parseProductInput(req.body, {
        isForm: isFormRequest(req),
        isAdmin,
        isCreate: false
    });

    if (parsed.errors.length) {
        return rejectForm(req, res, "products/edit-product", {
            status: 400,
            title: "Edit Product",
            error: parsed.errors.join(" "),
            formData: req.body,
            product: product.toObject()
        });
    }

    try {
        const gallery = planGallery(product, req.files, req.body?.removeImages);
        const uploaded = await uploadProductImages(req.files);

        let imagesChanged = false;

        if (uploaded.image) {
            product.image = uploaded.image;
            imagesChanged = true;
        }

        if (uploaded.images.length || gallery.removed) {
            product.images = [...gallery.kept, ...uploaded.images];
            imagesChanged = true;
        }

        for (const [field, value] of Object.entries(parsed.data)) {
            product.set(field, value);
        }

        for (const [path, value] of Object.entries(parsed.seller)) {
            product.set(`seller.${path}`, value);
        }

        const materialChange =
            imagesChanged ||
            REAPPROVAL_FIELDS.some((field) => product.isModified(field));

        const needsReview =
            !isAdmin &&
            (product.approvalStatus === APPROVAL_STATUS.REJECTED ||
                (product.approvalStatus === APPROVAL_STATUS.APPROVED &&
                    materialChange));

        if (needsReview) {
            product.approvalStatus = APPROVAL_STATUS.PENDING;
            product.approvedBy = null;
            product.approvedAt = undefined;
            product.rejectionReason = undefined;
        }

        await product.save();
    } catch (error) {
        const clientError = toClientError(error);

        if (!clientError) throw error;

        return rejectForm(req, res, "products/edit-product", {
            status: clientError.status,
            title: "Edit Product",
            error: clientError.message,
            formData: req.body,
            product: product.toObject()
        });
    }

    return respond(req, res, {
        redirectTo: productsHome(role),
        data: product,
        message: "Product updated successfully"
    });
});

const deleteProduct = asyncHandler(async (req, res) => {
    const role = requireSellerRole(req);

    const product = await findOwnedProduct(req.params.id, req.user._id);

    await Product.updateOne(
        { _id: product._id },
        {
            $set: {
                isDeleted: true,
                isActive: false,
                deletedAt: new Date(),
                slug: `${product.slug || "product"}-deleted-${Date.now().toString(36)}`
            },
            $unset: { sku: "" }
        }
    );

    return respond(req, res, {
        redirectTo: safeRedirect(req.body?.redirect, productsHome(role)),
        data: {},
        message: "Product deleted successfully"
    });
});

const searchProducts = asyncHandler(async (req, res) => {
    const keyword = queryString(req.query.q ?? req.query.keyword, MAX_KEYWORD_LENGTH);

    if (!keyword) {
        throw new ApiError(400, "Search keyword is required");
    }

    const listing = await runListing({
        baseConditions: publicConditions(),
        query: { ...req.query, q: keyword },
        projection: LISTING_PROJECTION
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                totalResults: listing.total,
                products: listing.products,
                pagination: listing.pagination
            },
            "Products fetched successfully"
        )
    );
});

const filterProductsByCategory = asyncHandler(async (req, res) => {
    const category = matchCategory(queryString(req.params.category));

    if (!category) {
        throw new ApiError(400, "Invalid category");
    }

    const listing = await runListing({
        baseConditions: publicConditions(),
        query: { ...req.query, category },
        projection: LISTING_PROJECTION
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                category,
                totalProducts: listing.total,
                products: listing.products,
                pagination: listing.pagination
            },
            "Category products fetched successfully"
        )
    );
});

export {
    addProduct,
    showAddProductPage,
    showEditProductPage,
    getAllProducts,
    getMyProducts,
    getProductById,
    updateProduct,
    getProductDetails,
    deleteProduct,
    searchProducts,
    filterProductsByCategory
};