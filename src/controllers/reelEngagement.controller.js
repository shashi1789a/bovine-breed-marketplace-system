import { Reel } from "../models/reel.model.js";
import { ReelLike } from "../models/reelLike.model.js";
import { ReelComment, MAX_COMMENT_LENGTH } from "../models/reelComment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString } from "../utils/http.js";
import { notify } from "../services/notification.service.js";

const COMMENT_PAGE = 20;
const VIEW_WINDOW_MS = 30 * 60 * 1000;
const seenViews = new Map();

const requireReel = async (id, fields = "farmer isActive") => {
    if (!isObjectId(id)) throw new ApiError(400, "Invalid reel id");

    const reel = await Reel.findOne({ _id: id, isActive: true }).select(fields).lean();

    if (!reel) throw new ApiError(404, "Reel not found");

    return reel;
};

const shapeComment = (comment, viewer, reelFarmerId) => {
    const author = comment.user || {};
    const viewerId = viewer?._id ? String(viewer._id) : null;
    const isAuthor = viewerId !== null && viewerId === String(author._id || comment.user);
    const isReelOwner = viewerId !== null && viewerId === String(reelFarmerId);
    const isAdmin = viewer?.role?.toLowerCase() === "admin";

    return {
        id: String(comment._id),
        text: comment.text,
        createdAt: comment.createdAt,
        user: {
            id: String(author._id || comment.user),
            fullName: author.fullName || "User",
            username: author.username || "",
            avatar: author.avatar || ""
        },
        canDelete: isAuthor || isReelOwner || isAdmin
    };
};

export const removeReelEngagement = async (reelIds) => {
    if (!reelIds.length) return;

    await Promise.all([
        ReelLike.deleteMany({ reel: { $in: reelIds } }),
        ReelComment.deleteMany({ reel: { $in: reelIds } })
    ]);
};

export const toggleLike = asyncHandler(async (req, res) => {
    const reel = await requireReel(req.params.id);

    const removed = await ReelLike.findOneAndDelete({ reel: reel._id, user: req.user._id });

    if (removed) {
        await Reel.updateOne({ _id: reel._id, likeCount: { $gt: 0 } }, { $inc: { likeCount: -1 } });
    } else {
        try {
            await ReelLike.create({ reel: reel._id, user: req.user._id });
            await Reel.updateOne({ _id: reel._id }, { $inc: { likeCount: 1 } });
        } catch (error) {
            if (error?.code !== 11000) throw error;
        }
    }

    const fresh = await Reel.findById(reel._id).select("likeCount").lean();

    return res
        .status(200)
        .json(new ApiResponse(200, { liked: !removed, likeCount: fresh?.likeCount || 0 }, "OK"));
});

export const listComments = asyncHandler(async (req, res) => {
    const reel = await requireReel(req.params.id);
    const filter = { reel: reel._id };

    if (isObjectId(String(req.query.before || ""))) filter._id = { $lt: req.query.before };

    const rows = await ReelComment.find(filter)
        .sort({ _id: -1 })
        .limit(COMMENT_PAGE + 1)
        .populate("user", "fullName username avatar")
        .lean();

    const hasMore = rows.length > COMMENT_PAGE;
    const page = hasMore ? rows.slice(0, COMMENT_PAGE) : rows;

    return res.status(200).json(
        new ApiResponse(
            200,
            { comments: page.map((row) => shapeComment(row, req.user, reel.farmer)), hasMore },
            "OK"
        )
    );
});

export const addComment = asyncHandler(async (req, res) => {
    const reel = await requireReel(req.params.id);
    const text = queryString(req.body?.text, MAX_COMMENT_LENGTH).replace(/\s+/g, " ");

    if (!text) throw new ApiError(400, "Write something first");

    const created = await ReelComment.create({ reel: reel._id, user: req.user._id, text });

    await Reel.updateOne({ _id: reel._id }, { $inc: { commentCount: 1 } });

    if (String(reel.farmer) !== String(req.user._id)) {
        await notify(reel.farmer, {
            type: "reel_comment",
            title: `${req.user.fullName} commented on your reel`,
            body: text.slice(0, 120),
            link: `/reels?start=${reel._id}`
        });
    }

    const comment = shapeComment(
        { ...created.toObject(), user: { _id: req.user._id, fullName: req.user.fullName, username: req.user.username, avatar: req.user.avatar } },
        req.user,
        reel.farmer
    );

    return res.status(201).json(new ApiResponse(201, { comment }, "Comment added"));
});

export const deleteComment = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.commentId)) throw new ApiError(400, "Invalid comment id");

    const reel = await requireReel(req.params.id);
    const comment = await ReelComment.findOne({ _id: req.params.commentId, reel: reel._id });

    if (!comment) throw new ApiError(404, "Comment not found");

    const allowed =
        String(comment.user) === String(req.user._id) ||
        String(reel.farmer) === String(req.user._id) ||
        req.user.role?.toLowerCase() === "admin";

    if (!allowed) throw new ApiError(403, "You cannot delete this comment");

    await comment.deleteOne();
    await Reel.updateOne({ _id: reel._id, commentCount: { $gt: 0 } }, { $inc: { commentCount: -1 } });

    return res.status(200).json(new ApiResponse(200, {}, "Comment deleted"));
});

export const recordView = asyncHandler(async (req, res) => {
    const reel = await requireReel(req.params.id);
    const viewer = req.user ? String(req.user._id) : `ip:${req.ip}`;

    if (req.user && String(reel.farmer) === String(req.user._id)) {
        return res.status(200).json(new ApiResponse(200, {}, "OK"));
    }

    const key = `${viewer}:${reel._id}`;
    const now = Date.now();
    const last = seenViews.get(key);

    if (!last || now - last > VIEW_WINDOW_MS) {
        seenViews.set(key, now);
        await Reel.updateOne({ _id: reel._id }, { $inc: { viewCount: 1 } });

        if (seenViews.size > 20000) {
            for (const [entryKey, time] of seenViews) {
                if (now - time > VIEW_WINDOW_MS) seenViews.delete(entryKey);
            }
        }
    }

    return res.status(200).json(new ApiResponse(200, {}, "OK"));
});
