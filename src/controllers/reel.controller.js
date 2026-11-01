import fs from "fs";
import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";

import { Reel } from "../models/reel.model.js";
import { Cattle } from "../models/cattle.model.js";
import { User } from "../models/user.model.js";
import { Wishlist } from "../models/wishlist.model.js";
import { ReelLike } from "../models/reelLike.model.js";
import { Follow } from "../models/follow.model.js";
import { notifyMany } from "../services/notification.service.js";
import { removeReelEngagement } from "./reelEngagement.controller.js";
import { loadReviewPanel } from "./review.controller.js";
import { ApiError } from "../utils/ApiError.js";
import { readFlash } from "../utils/http.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { discardReelUpload } from "../middlewares/reelUpload.middleware.js";
import {
    STREAM_TRANSFORMATION,
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

const emptyContext = () => ({ saved: new Set(), liked: new Set(), following: new Set() });

const toPublicReel = (doc, viewer, context = emptyContext()) => {
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
        saved: context.saved.has(String(cattle._id || doc.cattle)),
        liked: context.liked.has(String(doc._id)),
        likeCount: doc.likeCount || 0,
        commentCount: doc.commentCount || 0,
        viewCount: doc.viewCount || 0,
        farmer: {
            id: String(farmer._id || doc.farmer),
            fullName: farmer.fullName || "Farmer",
            username: farmer.username || "",
            avatar: farmer.avatar || "",
            farmName: farmer.farmerDetails?.farmName || "",
            location: farmer.farmerDetails?.location || "",
            verified: farmer.verification?.status === "verified",
            following: context.following.has(String(farmer._id || doc.farmer)),
            canContact: Boolean(farmer.privacy?.showContact && farmer.contactPhone),
            phone: viewer && farmer.privacy?.showContact && farmer.contactPhone ? farmer.contactPhone : "",
            ratingAvg: farmer.sellerRating?.avg || 0,
            ratingCount: farmer.sellerRating?.count || 0
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

const listVisibleReels = async ({ before, farmerId, farmerIds, cattleId, limit = PAGE_SIZE }) => {
    const match = { isActive: true };

    if (farmerIds) match.farmer = { $in: farmerIds };

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
                likeCount: 1,
                commentCount: 1,
                viewCount: 1,
                farmer: 1,
                cattle: 1,
                "farmerInfo._id": 1,
                "farmerInfo.fullName": 1,
                "farmerInfo.username": 1,
                "farmerInfo.avatar": 1,
                "farmerInfo.farmerDetails": 1,
                "farmerInfo.verification.status": 1,
                "farmerInfo.contactPhone": 1,
                "farmerInfo.privacy.showContact": 1,
                "farmerInfo.sellerRating": 1,
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

const buildContext = async (user, list) => {
    const context = emptyContext();

    if (!user || !list.length) return context;

    const cattleIds = list.map((row) => row.cattleInfo._id);
    const reelIds = list.map((row) => row._id);
    const farmerIds = list.map((row) => row.farmerInfo._id);

    const [saved, liked, following] = await Promise.all([
        Wishlist.find({ user: user._id, cattle: { $in: cattleIds } }).select("cattle").lean(),
        ReelLike.find({ user: user._id, reel: { $in: reelIds } }).select("reel").lean(),
        Follow.find({ follower: user._id, farmer: { $in: farmerIds } }).select("farmer").lean()
    ]);

    context.saved = new Set(saved.map((item) => String(item.cattle)));
    context.liked = new Set(liked.map((item) => String(item.reel)));
    context.following = new Set(following.map((item) => String(item.farmer)));

    return context;
};

export const listReels = asyncHandler(async (req, res) => {
    let farmerIds;

    if (req.query.feed === "following") {
        if (!req.user) throw new ApiError(401, "Please login to see reels from farmers you follow.");

        const follows = await Follow.find({ follower: req.user._id }).select("farmer").limit(500).lean();
        farmerIds = follows.map((item) => item.farmer);

        if (!farmerIds.length) {
            return res.status(200).json(new ApiResponse(200, { reels: [], hasMore: false }, "OK"));
        }
    }

    const { rows, hasMore } = await listVisibleReels({
        before: req.query.before,
        farmerId: req.query.farmer,
        farmerIds,
        cattleId: req.query.cattle
    });

    const context = await buildContext(req.user, rows);
    let reels = rows.map((row) => toPublicReel(row, req.user, context));

    if (!req.query.before && !farmerIds && isObjectId(req.query.start) && !reels.some((r) => r.id === req.query.start)) {
        const found = await Reel.aggregate([
            { $match: { _id: toId(req.query.start), isActive: true } },
            { $lookup: { from: "cattles", localField: "cattle", foreignField: "_id", as: "cattleInfo" } },
            { $unwind: "$cattleInfo" },
            { $match: { "cattleInfo.isActive": { $ne: false }, "cattleInfo.sold": { $ne: true }, "cattleInfo.isDeleted": { $ne: true } } },
            { $lookup: { from: "users", localField: "farmer", foreignField: "_id", as: "farmerInfo" } },
            { $unwind: "$farmerInfo" },
            { $limit: 1 }
        ]);

        if (found[0]) {
            const pinned = toPublicReel(found[0], req.user, await buildContext(req.user, found));
            reels = [pinned, ...reels];
        }
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

const compressionOptions = () =>
    process.env.REEL_COMPRESS === "stored"
        ? { transformation: [{ width: 720, crop: "limit", quality: "auto" }] }
        : { eager: [STREAM_TRANSFORMATION], eager_async: true };

const destroyAsset = (publicId) =>
    cloudinary.uploader
        .destroy(publicId, { resource_type: "video", invalidate: true })
        .catch((error) => console.error("[reel] could not delete video:", error.message));

const announceReel = async ({ reel, farmer, cattle }) => {
    const followers = await Follow.find({ farmer: farmer._id }).select("follower").limit(1000).lean();

    if (!followers.length) return;

    await notifyMany(
        followers.map((item) => item.follower),
        {
            type: "new_reel",
            title: `${farmer.fullName} posted a new reel`,
            body: reel.caption || cattle.name || cattle.breedName || "",
            link: `/reels?start=${reel._id}`
        }
    );
};

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
            use_filename: false,
            ...compressionOptions()
        });

        if (!uploaded?.secure_url || !uploaded.public_id) {
            throw new ApiError(502, "Could not upload the video. Please try again.");
        }

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
                sizeBytes: uploaded.bytes || req.file.size,
                caption: cleanCaption(req.body?.caption),
                optimized: true
            });
        } catch (error) {
            await destroyAsset(uploaded.public_id);
            throw error;
        }

        announceReel({ reel, farmer: req.user, cattle }).catch((error) =>
            console.error("[reel] follower alert failed:", error.message)
        );

        return res
            .status(201)
            .json(new ApiResponse(201, { id: String(reel._id), url: `/reels?start=${reel._id}` }, "Reel uploaded"));
    } finally {
        await discardReelUpload(req);
    }
});

export const removeReelsForCattle = async (cattleId) => {
    const reels = await Reel.find({ cattle: cattleId }).select("publicId").lean();

    const full = await Reel.find({ cattle: cattleId }).select("_id").lean();

    await Promise.all(reels.map((reel) => destroyAsset(reel.publicId)));
    await removeReelEngagement(full.map((reel) => reel._id));
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
    await removeReelEngagement([reel._id]);
    await reel.deleteOne();

    return res.status(200).json(new ApiResponse(200, {}, "Reel deleted"));
});

export const showFarmerProfile = asyncHandler(async (req, res) => {
    const username = String(req.params.username || "").toLowerCase();

    const farmer = /^[a-z0-9_.]{3,30}$/.test(username)
        ? await User.findOne({ username, role: "farmer", isActive: { $ne: false } })
              .select("fullName username avatar farmerDetails createdAt sellerRating verification.status")
              .lean()
        : null;

    if (!farmer) {
        return res.status(404).render("404", { title: "Farmer not found", user: req.user || null });
    }

    const [cattle, reelCount, panel, followers, isFollowing] = await Promise.all([
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
        Reel.countDocuments({ farmer: farmer._id, isActive: true }),
        loadReviewPanel(farmer, req.user),
        Follow.countDocuments({ farmer: farmer._id }),
        req.user ? Follow.exists({ follower: req.user._id, farmer: farmer._id }) : null
    ]);

    return res.render("farmers/profile", {
        title: `${farmer.fullName} | BoviNetra`,
        user: req.user || null,
        farmer,
        cattle,
        reelCount,
        followers,
        isFollowing: Boolean(isFollowing),
        reviews: panel.reviews,
        eligibleDeals: panel.eligible,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error),
        isMe: Boolean(req.user && String(req.user._id) === String(farmer._id))
    });
});
