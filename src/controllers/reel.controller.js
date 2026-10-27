import fs from "fs";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

import { Reel } from "../models/reel.model.js";
import { Cattle } from "../models/cattle.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { discardReelUpload } from "../middlewares/reelUpload.middleware.js";
import {
    MAX_REELS_PER_CATTLE,
    MAX_REEL_SECONDS,
    cleanCaption,
    posterUrlFor,
    streamUrlFor,
    videoMatchesType
} from "../utils/reel.helpers.js";

const PAGE_SIZE = 6;
const ADMIN_ROLE = "admin";
const OBJECT_ID = /^[a-f\d]{24}$/i;

const isObjectId = (value) => typeof value === "string" && OBJECT_ID.test(value);
const toId = (value) => new mongoose.Types.ObjectId(value);

const cloudinaryReady = () =>
    Boolean(
        process.env.CLOUDINARY_CLOUD_NAME &&
            process.env.CLOUDINARY_API_KEY &&
            process.env.CLOUDINARY_API_SECRET
    );

/* ---------------------------------------------------------------- shaping */

const toPublicReel = (doc, viewer) => {
    const viewerId = viewer?._id ? String(viewer._id) : null;
    const farmer = doc.farmerInfo || {};
    const cattle = doc.cattleInfo || {};

    return {
        id: String(doc._id),
        videoUrl: streamUrlFor(doc.videoUrl),
        originalUrl: doc.videoUrl,
        posterUrl: posterUrlFor(doc.videoUrl),
        caption: doc.caption || "",
        durationSec: doc.durationSec,
        createdAt: doc.createdAt,
        mine: viewerId !== null && viewerId === String(doc.farmer),
        farmer: {
            id: String(farmer._id || doc.farmer),
            fullName: farmer.fullName || "Farmer",
            username: farmer.username || "",
            avatar: farmer.avatar || "",
            farmName: farmer.farmerDetails?.farmName || "",
            location: farmer.farmerDetails?.location || ""
        },
        cattle: {
            id: String(cattle._id || doc.cattle),
            title: cattle.name || cattle.breedName || "Cattle",
            breedName: cattle.breedName || "",
            category: cattle.category || "",
            gender: cattle.gender || "",
            age: cattle.age ?? null,
            price: cattle.price ?? null,
            image: cattle.imageUrl || cattle.images?.[0] || ""
        }
    };
};

/* Only reels whose cattle is still for sale and whose farmer is active are shown. */
const listVisibleReels = async ({ before, farmerId, cattleId, limit = PAGE_SIZE }) => {
    const match = { isActive: true };

    if (before && isObjectId(before)) match._id = { $lt: toId(before) };
    if (farmerId && isObjectId(farmerId)) match.farmer = toId(farmerId);
    if (cattleId && isObjectId(cattleId)) match.cattle = toId(cattleId);

    const rows = await Reel.aggregate([
        { $match: match },
        { $sort: { _id: -1 } },
        { $lookup: { from: "cattles", localField: "cattle", foreignField: "_id", as: "cattleInfo" } },
        { $unwind: "$cattleInfo" },
        {
            $match: {
                "cattleInfo.isActive": { $ne: false },
                "cattleInfo.sold": { $ne: true },
                "cattleInfo.isDeleted": { $ne: true }
            }
        },
        { $lookup: { from: "users", localField: "farmer", foreignField: "_id", as: "farmerInfo" } },
        { $unwind: "$farmerInfo" },
        { $match: { "farmerInfo.isActive": { $ne: false } } },
        { $limit: limit + 1 },
        {
            $project: {
                videoUrl: 1,
                caption: 1,
                durationSec: 1,
                createdAt: 1,
                farmer: 1,
                cattle: 1,
                "farmerInfo._id": 1,
                "farmerInfo.fullName": 1,
                "farmerInfo.username": 1,
                "farmerInfo.avatar": 1,
                "farmerInfo.farmerDetails": 1,
                "cattleInfo._id": 1,
                "cattleInfo.name": 1,
                "cattleInfo.breedName": 1,
                "cattleInfo.category": 1,
                "cattleInfo.gender": 1,
                "cattleInfo.age": 1,
                "cattleInfo.price": 1,
                "cattleInfo.imageUrl": 1,
                "cattleInfo.images": 1
            }
        }
    ]);

    const hasMore = rows.length > limit;

    return { rows: hasMore ? rows.slice(0, limit) : rows, hasMore };
};

/* ------------------------------------------------------------------ pages */

export const showReelsPage = asyncHandler(async (req, res) => {
    const filter = {
        farmer: isObjectId(req.query.farmer) ? req.query.farmer : "",
        cattle: isObjectId(req.query.cattle) ? req.query.cattle : "",
        start: isObjectId(req.query.start) ? req.query.start : ""
    };

    return res.render("reels/index", {
        title: "Cattle Reels | BoviNetra",
        user: req.user || null,
        filter,
        canUpload: req.user?.role?.toLowerCase() === "farmer"
    });
});

export const listReels = asyncHandler(async (req, res) => {
    const { rows, hasMore } = await listVisibleReels({
        before: req.query.before,
        farmerId: req.query.farmer,
        cattleId: req.query.cattle
    });

    let reels = rows.map((row) => toPublicReel(row, req.user));

    /* A shared link (?start=<id>) puts that reel first, if it is still visible. */
    if (!req.query.before && isObjectId(req.query.start) && !reels.some((r) => r.id === req.query.start)) {
        const found = await Reel.aggregate([
            { $match: { _id: toId(req.query.start), isActive: true } },
            { $lookup: { from: "cattles", localField: "cattle", foreignField: "_id", as: "cattleInfo" } },
            { $unwind: "$cattleInfo" },
            { $match: { "cattleInfo.isActive": { $ne: false }, "cattleInfo.sold": { $ne: true }, "cattleInfo.isDeleted": { $ne: true } } },
            { $lookup: { from: "users", localField: "farmer", foreignField: "_id", as: "farmerInfo" } },
            { $unwind: "$farmerInfo" },
            { $limit: 1 }
        ]);

        if (found[0]) reels = [toPublicReel(found[0], req.user), ...reels];
    }

    return res.status(200).json(new ApiResponse(200, { reels, hasMore }, "OK"));
});

export const showUploadPage = asyncHandler(async (req, res) => {
    const cattle = await Cattle.find({
        farmer: req.user._id,
        isActive: { $ne: false },
        sold: { $ne: true },
        isDeleted: { $ne: true }
    })
        .select("name breedName category")
        .sort({ createdAt: -1 })
        .limit(200)
        .lean();

    return res.render("reels/upload", {
        title: "Upload a Reel | BoviNetra",
        user: req.user,
        cattle,
        selected: isObjectId(req.query.cattle) ? req.query.cattle : "",
        maxSeconds: MAX_REEL_SECONDS
    });
});

/* --------------------------------------------------------------- creating */

const readHead = async (filePath) => {
    const handle = await fs.promises.open(filePath, "r");

    try {
        const buffer = Buffer.alloc(16);
        const { bytesRead } = await handle.read(buffer, 0, 16, 0);
        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
};

const destroyAsset = (publicId) =>
    cloudinary.uploader
        .destroy(publicId, { resource_type: "video", invalidate: true })
        .catch((error) => console.error("[reel] could not delete video:", error.message));

export const createReel = asyncHandler(async (req, res) => {
    try {
        if (!req.file) throw new ApiError(400, "Choose a video to upload");

        if (!cloudinaryReady()) {
            console.error("[reel] uploads are off: CLOUDINARY_* environment variables are missing");
            throw new ApiError(503, "Video uploads are not set up on the server yet");
        }

        const cattleId = String(req.body?.cattleId || "");

        if (!isObjectId(cattleId)) throw new ApiError(400, "Choose which cattle this video is for");

        const cattle = await Cattle.findOne({ _id: cattleId, farmer: req.user._id }).lean();

        if (!cattle || cattle.isDeleted) throw new ApiError(404, "Cattle not found");

        if (cattle.sold || cattle.isActive === false) {
            throw new ApiError(400, "This cattle is not for sale, so a reel cannot be added");
        }

        const existing = await Reel.countDocuments({ cattle: cattle._id, isActive: true });

        if (existing >= MAX_REELS_PER_CATTLE) {
            throw new ApiError(400, `You can add up to ${MAX_REELS_PER_CATTLE} reels per cattle. Delete one first.`);
        }

        const head = await readHead(req.file.path);

        if (!videoMatchesType(req.file.mimetype, head)) {
            throw new ApiError(400, "That file does not look like a real video");
        }

        const uploaded = await uploadOnCloudinary(req.file.path, {
            resource_type: "video",
            folder: "bovinetra/reels",
            unique_filename: true,
            use_filename: false
        });

        if (!uploaded?.secure_url || !uploaded.public_id) {
            throw new ApiError(502, "Could not upload the video. Please try again.");
        }

        /* The server, not the browser, decides how long the video really is. */
        if (!(uploaded.duration > 0) || uploaded.duration > MAX_REEL_SECONDS + 0.5) {
            await destroyAsset(uploaded.public_id);
            throw new ApiError(400, `Reels can be at most ${MAX_REEL_SECONDS} seconds long`);
        }

        let reel;

        try {
            reel = await Reel.create({
                cattle: cattle._id,
                farmer: req.user._id,
                videoUrl: uploaded.secure_url,
                publicId: uploaded.public_id,
                durationSec: Math.min(uploaded.duration, MAX_REEL_SECONDS + 1),
                sizeBytes: req.file.size,
                caption: cleanCaption(req.body?.caption)
            });
        } catch (error) {
            await destroyAsset(uploaded.public_id);
            throw error;
        }

        return res
            .status(201)
            .json(new ApiResponse(201, { id: String(reel._id), url: `/reels?start=${reel._id}` }, "Reel uploaded"));
    } finally {
        await discardReelUpload(req);
    }
});

/* --------------------------------------------------------------- deleting */

export const removeReelsForCattle = async (cattleId) => {
    const reels = await Reel.find({ cattle: cattleId }).select("publicId").lean();

    await Promise.all(reels.map((reel) => destroyAsset(reel.publicId)));
    await Reel.deleteMany({ cattle: cattleId });

    return reels.length;
};

export const deleteReel = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, "Invalid reel id");

    const reel = await Reel.findById(req.params.id);

    if (!reel) throw new ApiError(404, "Reel not found");

    const isOwner = String(reel.farmer) === String(req.user._id);
    const isAdmin = req.user.role?.toLowerCase() === ADMIN_ROLE;

    if (!isOwner && !isAdmin) throw new ApiError(403, "You can only delete your own reels");

    await destroyAsset(reel.publicId);
    await reel.deleteOne();

    return res.status(200).json(new ApiResponse(200, {}, "Reel deleted"));
});

/* ---------------------------------------------------------- farmer profile */

export const showFarmerProfile = asyncHandler(async (req, res) => {
    const username = String(req.params.username || "").toLowerCase();

    const farmer = /^[a-z0-9_.]{3,30}$/.test(username)
        ? await User.findOne({ username, role: "farmer", isActive: { $ne: false } })
              .select("fullName username avatar farmerDetails createdAt")
              .lean()
        : null;

    if (!farmer) {
        return res.status(404).render("404", { title: "Farmer not found", user: req.user || null });
    }

    const [cattle, reelCount] = await Promise.all([
        Cattle.find({
            farmer: farmer._id,
            isActive: { $ne: false },
            sold: { $ne: true },
            isDeleted: { $ne: true }
        })
            .select("name breedName category gender age price imageUrl images")
            .sort({ createdAt: -1 })
            .limit(24)
            .lean(),
        Reel.countDocuments({ farmer: farmer._id, isActive: true })
    ]);

    return res.render("farmers/profile", {
        title: `${farmer.fullName} | BoviNetra`,
        user: req.user || null,
        farmer,
        cattle,
        reelCount,
        isMe: Boolean(req.user && String(req.user._id) === String(farmer._id))
    });
});
