import crypto from "crypto";
import mongoose, { Schema } from "mongoose";

export const PRODUCT_CATEGORIES = Object.freeze([
    "Cattle Breed",
    "Vaccine",
    "Medicine",
    "Feed",
    "Other"
]);

export const SELLER_ROLES = Object.freeze(["farmer", "doctor", "admin"]);

export const APPROVAL_STATUS = Object.freeze({
    PENDING: "Pending",
    APPROVED: "Approved",
    REJECTED: "Rejected"
});

export const MAX_GALLERY_IMAGES = 8;

const EXPIRY_REQUIRED_CATEGORIES = Object.freeze(["Vaccine", "Medicine"]);
const MAX_TAGS = 20;

const roundMoney = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : value;
};

const wholeNumber = {
    validator: Number.isInteger,
    message: "{PATH} must be a whole number"
};

const slugify = (text) =>
    text
        .toLowerCase()
        .trim()
        .replace(/[^\w\s-]/g, "")
        .replace(/[\s_]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "") || "product";

const generateUniqueSlug = async (Model, name) => {
    const base = slugify(name).slice(0, 80);
    const taken = await Model.exists({ slug: base });

    return taken
        ? `${base}-${crypto.randomBytes(3).toString("hex")}`
        : base;
};

const reviewSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        name: {
            type: String,
            trim: true,
            maxlength: 120
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5
        },
        comment: {
            type: String,
            trim: true,
            maxlength: 1000
        }
    },
    { timestamps: true }
);

const productSchema = new Schema(
    {
        name: {
            type: String,
            required: [true, "Product name is required"],
            trim: true,
            minlength: [2, "Product name must be at least 2 characters"],
            maxlength: [200, "Product name cannot exceed 200 characters"]
        },

        slug: {
            type: String,
            trim: true,
            lowercase: true,
            unique: true,
            sparse: true
        },

        description: {
            type: String,
            required: [true, "Product description is required"],
            trim: true,
            maxlength: [5000, "Description cannot exceed 5000 characters"]
        },

        shortDescription: {
            type: String,
            trim: true,
            maxlength: [300, "Short description cannot exceed 300 characters"]
        },

        brand: {
            type: String,
            trim: true,
            maxlength: [120, "Brand cannot exceed 120 characters"]
        },

        sku: {
            type: String,
            trim: true,
            uppercase: true,
            maxlength: [60, "SKU cannot exceed 60 characters"],
            unique: true,
            sparse: true
        },

        barcode: {
            type: String,
            trim: true,
            maxlength: [60, "Barcode cannot exceed 60 characters"]
        },

        price: {
            type: Number,
            required: [true, "Price is required"],
            min: [0.01, "Price must be greater than 0"],
            set: roundMoney
        },

        mrp: {
            type: Number,
            min: [0, "MRP cannot be negative"],
            default: 0,
            set: roundMoney
        },

        discount: {
            type: Number,
            min: 0,
            max: 100,
            default: 0
        },

        currency: {
            type: String,
            default: "INR",
            uppercase: true,
            trim: true,
            match: [/^[A-Z]{3}$/, "Currency must be a 3 letter code"]
        },

        tax: {
            type: Number,
            min: [0, "Tax cannot be negative"],
            max: [100, "Tax cannot exceed 100"],
            default: 0
        },

        category: {
            type: String,
            required: [true, "Category is required"],
            enum: {
                values: PRODUCT_CATEGORIES,
                message: "{VALUE} is not a valid category"
            }
        },

        customCategory: {
            type: String,
            trim: true,
            maxlength: [100, "Custom category cannot exceed 100 characters"]
        },

        subCategory: {
            type: String,
            trim: true,
            maxlength: [100, "Sub category cannot exceed 100 characters"]
        },

        tags: {
            type: [
                {
                    type: String,
                    trim: true,
                    lowercase: true,
                    maxlength: 40
                }
            ],
            default: [],
            validate: {
                validator: (value) => value.length <= MAX_TAGS,
                message: `A product can have at most ${MAX_TAGS} tags`
            }
        },

        stock: {
            type: Number,
            default: 0,
            min: [0, "Stock cannot be negative"],
            validate: wholeNumber
        },

        minStock: {
            type: Number,
            default: 0,
            min: [0, "Minimum stock cannot be negative"],
            validate: wholeNumber
        },

        unit: {
            type: String,
            default: "piece",
            trim: true,
            maxlength: 30
        },

        image: {
            type: String,
            default: "",
            trim: true
        },

        images: {
            type: [String],
            default: [],
            validate: {
                validator: (value) => value.length <= MAX_GALLERY_IMAGES,
                message: `A product can have at most ${MAX_GALLERY_IMAGES} gallery images`
            }
        },

        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        ownerRole: {
            type: String,
            enum: SELLER_ROLES,
            required: true,
            index: true
        },

        seller: {
            name: {
                type: String,
                trim: true,
                maxlength: 120
            },
            phone: {
                type: String,
                trim: true,
                match: [/^[0-9+\-\s()]{7,20}$/, "Seller phone number is invalid"]
            },
            address: {
                type: String,
                trim: true,
                maxlength: 300
            }
        },

        weight: {
            type: Number,
            min: [0, "Weight cannot be negative"]
        },

        weightUnit: {
            type: String,
            default: "kg",
            trim: true,
            maxlength: 10
        },

        color: { type: String, trim: true, maxlength: 50 },
        size: { type: String, trim: true, maxlength: 50 },
        flavor: { type: String, trim: true, maxlength: 50 },

        manufactureDate: Date,
        expiryDate: Date,

        shippingCharge: {
            type: Number,
            default: 0,
            min: [0, "Shipping charge cannot be negative"],
            set: roundMoney
        },

        freeShipping: {
            type: Boolean,
            default: false
        },

        deliveryTime: {
            type: String,
            trim: true,
            maxlength: 100
        },

        isActive: {
            type: Boolean,
            default: true
        },

        sold: {
            type: Boolean,
            default: false
        },

        featured: {
            type: Boolean,
            default: false
        },

        approvalStatus: {
            type: String,
            enum: Object.values(APPROVAL_STATUS),
            default: APPROVAL_STATUS.PENDING
        },

        approvedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        approvedAt: Date,

        rejectionReason: {
            type: String,
            trim: true,
            maxlength: 500
        },

        ratings: {
            type: Number,
            default: 0,
            min: 0,
            max: 5
        },

        numOfReviews: {
            type: Number,
            default: 0,
            min: 0
        },

        reviews: [reviewSchema],

        views: {
            type: Number,
            default: 0,
            min: 0
        },

        soldCount: {
            type: Number,
            default: 0,
            min: 0
        },

        wishlistCount: {
            type: Number,
            default: 0,
            min: 0
        },

        isDeleted: {
            type: Boolean,
            default: false
        },

        deletedAt: Date
    },
    {
        timestamps: true,
        id: false,
        toJSON: {
            virtuals: true,
            transform: (_doc, ret) => {
                delete ret.__v;
                return ret;
            }
        },
        toObject: { virtuals: true }
    }
);

productSchema.virtual("inStock").get(function () {
    return this.stock > 0;
});

productSchema.virtual("isLowStock").get(function () {
    return this.stock > 0 && this.stock <= (this.minStock || 0);
});

productSchema.virtual("isExpired").get(function () {
    return Boolean(this.expiryDate) && this.expiryDate.getTime() < Date.now();
});

productSchema.statics.publicFilter = function () {
    return {
        isActive: true,
        approvalStatus: APPROVAL_STATUS.APPROVED,
        $or: [
            { expiryDate: null },
            { expiryDate: { $gt: new Date() } }
        ]
    };
};

productSchema.pre("validate", async function () {
    if (this.isNew && !this.slug && this.name) {
        this.slug = await generateUniqueSlug(this.constructor, this.name);
    }

    if (this.category === "Other") {
        if (!this.customCategory) {
            this.invalidate(
                "customCategory",
                "Custom category is required when category is Other"
            );
        }
    } else {
        this.customCategory = undefined;
    }

    if (this.mrp > 0 && this.price > this.mrp) {
        this.invalidate("price", "Price cannot be greater than MRP");
    }

    this.discount =
        this.mrp > 0 && this.price <= this.mrp
            ? Math.round(((this.mrp - this.price) / this.mrp) * 100)
            : 0;

    if (
        EXPIRY_REQUIRED_CATEGORIES.includes(this.category) &&
        !this.expiryDate
    ) {
        this.invalidate(
            "expiryDate",
            "Expiry date is required for vaccines and medicines"
        );
    }

    if (
        this.expiryDate &&
        (this.isNew || this.isModified("expiryDate")) &&
        this.expiryDate.getTime() <= Date.now()
    ) {
        this.invalidate("expiryDate", "Expiry date must be in the future");
    }

    if (
        this.manufactureDate &&
        (this.isNew || this.isModified("manufactureDate")) &&
        this.manufactureDate.getTime() > Date.now()
    ) {
        this.invalidate(
            "manufactureDate",
            "Manufacture date cannot be in the future"
        );
    }

    if (
        this.manufactureDate &&
        this.expiryDate &&
        this.expiryDate.getTime() <= this.manufactureDate.getTime()
    ) {
        this.invalidate(
            "expiryDate",
            "Expiry date must be after the manufacture date"
        );
    }

    if (this.freeShipping) {
        this.shippingCharge = 0;
    }
});

productSchema.pre(
    [
        "find",
        "findOne",
        "findOneAndUpdate",
        "findOneAndDelete",
        "countDocuments",
        "updateOne",
        "updateMany"
    ],
    function () {
        if (this.getOptions().includeDeleted) return;
        this.where({ isDeleted: { $ne: true } });
    }
);

productSchema.pre("aggregate", function () {
    if (this.options?.includeDeleted) return;
    this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
});

productSchema.methods.calculateRatings = function () {
    if (!this.reviews || this.reviews.length === 0) {
        this.ratings = 0;
        this.numOfReviews = 0;
        return;
    }

    const total = this.reviews.reduce((sum, item) => sum + item.rating, 0);

    this.numOfReviews = this.reviews.length;
    this.ratings = Number((total / this.reviews.length).toFixed(1));
};

productSchema.index({ isActive: 1, approvalStatus: 1, createdAt: -1 });
productSchema.index({ isActive: 1, approvalStatus: 1, category: 1, price: 1 });
productSchema.index({ owner: 1, createdAt: -1 });
productSchema.index({ owner: 1, approvalStatus: 1 });
productSchema.index({ expiryDate: 1 }, { sparse: true });

export const Product = mongoose.model("Product", productSchema);