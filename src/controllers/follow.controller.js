import { Follow, MAX_FOLLOWING } from "../models/follow.model.js";
import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { reject, respond } from "../utils/http.js";
import { notify } from "../services/notification.service.js";

const findFarmer = async (username) => {
    const clean = String(username || "").toLowerCase();

    const farmer = /^[a-z0-9_.]{3,30}$/.test(clean)
        ? await User.findOne({ username: clean, role: "farmer", isActive: { $ne: false } }).select("_id username fullName")
        : null;

    if (!farmer) throw new ApiError(404, "Farmer not found");

    return farmer;
};

export const followFarmer = asyncHandler(async (req, res) => {
    const farmer = await findFarmer(req.params.username);
    const back = `/farmers/${farmer.username}`;

    if (String(farmer._id) === String(req.user._id)) {
        return reject(req, res, { status: 400, message: "You cannot follow yourself", redirectTo: back });
    }

    const total = await Follow.countDocuments({ follower: req.user._id });

    if (total >= MAX_FOLLOWING) {
        return reject(req, res, {
            status: 400,
            message: `You can follow up to ${MAX_FOLLOWING} farmers. Unfollow some first.`,
            redirectTo: back
        });
    }

    const result = await Follow.updateOne(
        { follower: req.user._id, farmer: farmer._id },
        { $setOnInsert: { follower: req.user._id, farmer: farmer._id } },
        { upsert: true }
    );

    if (result.upsertedCount) {
        await notify(farmer._id, {
            type: "new_follower",
            title: `${req.user.fullName} started following you`,
            body: "They will see your new reels first.",
            link: `/farmers/${req.user.username}`
        });
    }

    const followers = await Follow.countDocuments({ farmer: farmer._id });

    return respond(req, res, {
        status: 201,
        redirectTo: back,
        data: { following: true, followers },
        message: `You are following ${farmer.fullName}`
    });
});

export const unfollowFarmer = asyncHandler(async (req, res) => {
    const farmer = await findFarmer(req.params.username);

    await Follow.deleteOne({ follower: req.user._id, farmer: farmer._id });

    const followers = await Follow.countDocuments({ farmer: farmer._id });

    return respond(req, res, {
        redirectTo: `/farmers/${farmer.username}`,
        data: { following: false, followers },
        message: `You unfollowed ${farmer.fullName}`
    });
});
