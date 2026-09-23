import crypto from "crypto";
import mongoose, { Schema } from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

export const USER_ROLES = Object.freeze(["user", "admin", "farmer", "doctor", "buyer"]);
export const SELF_REGISTER_ROLES = Object.freeze(["farmer", "doctor", "buyer", "user"]);
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_SESSIONS = 5;
const ROTATION_GRACE_MS = 10 * 1000;
const BCRYPT_ROUNDS = 12;

const hashToken = (token) =>
    crypto.createHash("sha256").update(token).digest("hex");

const sessionSchema = new Schema(
    {
        tokenHash: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
        expiresAt: Date
    },
    { _id: false }
);

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            unique: true,
            lowercase: true,
            trim: true,
            minlength: [3, "Username must be at least 3 characters"],
            maxlength: [30, "Username cannot exceed 30 characters"],
            match: [/^[a-z0-9_.]+$/, "Username can only contain letters, numbers, dot and underscore"]
        },

        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            maxlength: [254, "Email cannot exceed 254 characters"],
            match: [EMAIL_PATTERN, "Enter a valid email address"]
        },

        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
            minlength: [2, "Full name must be at least 2 characters"],
            maxlength: [100, "Full name cannot exceed 100 characters"]
        },

        avatar: {
            type: String,
            required: [true, "Avatar is required"]
        },

        coverImage: {
            type: String,
            default: ""
        },

        role: {
            type: String,
            enum: {
                values: USER_ROLES,
                message: "{VALUE} is not a valid role"
            },
            default: "user",
            index: true
        },

        farmerDetails: {
            farmName: { type: String, trim: true, maxlength: 150 },
            location: { type: String, trim: true, maxlength: 200 }
        },

        doctorDetails: {
            specialization: { type: String, trim: true, maxlength: 150 },
            experience: { type: Number, min: 0, max: 80 }
        },

        buyerDetails: {
            address: { type: String, trim: true, maxlength: 300 }
        },

        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [8, "Password must be at least 8 characters"],
            maxlength: [72, "Password cannot exceed 72 characters"],
            select: false
        },

        isActive: {
            type: Boolean,
            default: true
        },

        passwordChangedAt: Date,

        lastLoginAt: Date,

        refreshTokens: {
            type: [sessionSchema],
            default: [],
            select: false
        }
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                delete ret.password;
                delete ret.refreshTokens;
                delete ret.__v;
                return ret;
            }
        }
    }
);

userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;

    this.password = await bcrypt.hash(this.password, BCRYPT_ROUNDS);
});

userSchema.methods.isPasswordCorrect = async function (password) {
    if (!this.password) return false;
    return bcrypt.compare(password, this.password);
};

userSchema.methods.generateAccessToken = function () {
    return jwt.sign(
        { _id: this._id, role: this.role },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );
};

userSchema.methods.generateRefreshToken = function () {
    return jwt.sign(
        { _id: this._id, jti: crypto.randomUUID() },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
    );
};

userSchema.statics.addSession = async function (userId, token, previousToken) {
    const now = new Date();

    await this.updateOne(
        { _id: userId },
        { $pull: { refreshTokens: { expiresAt: { $lte: now } } } }
    );

    if (previousToken) {
        await this.updateOne(
            {
                _id: userId,
                refreshTokens: {
                    $elemMatch: { tokenHash: hashToken(previousToken), expiresAt: null }
                }
            },
            {
                $set: {
                    "refreshTokens.$.expiresAt": new Date(now.getTime() + ROTATION_GRACE_MS)
                }
            }
        );
    }

    await this.updateOne(
        { _id: userId },
        {
            $push: {
                refreshTokens: {
                    $each: [{ tokenHash: hashToken(token), createdAt: now }],
                    $slice: -MAX_SESSIONS
                }
            }
        }
    );
};

userSchema.statics.hasSession = async function (userId, token) {
    const found = await this.exists({
        _id: userId,
        refreshTokens: {
            $elemMatch: {
                tokenHash: hashToken(token),
                $or: [{ expiresAt: null }, { expiresAt: { $gt: new Date() } }]
            }
        }
    });

    return Boolean(found);
};

userSchema.statics.removeSession = async function (userId, token) {
    await this.updateOne(
        { _id: userId },
        { $pull: { refreshTokens: { tokenHash: hashToken(token) } } }
    );
};

userSchema.statics.removeAllSessions = async function (userId) {
    await this.updateOne({ _id: userId }, { $set: { refreshTokens: [] } });
};

export const User = mongoose.model("User", userSchema);