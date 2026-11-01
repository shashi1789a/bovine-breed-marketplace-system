import { User } from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, readFlash, reject, respond } from "../utils/http.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { notify } from "../services/notification.service.js";
import fs from "fs";

const PHONE = /^[6-9]\d{9}$/;
const HOME = "/verification";

const dropUpload = async (req) => {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
};

export const showVerificationForm = asyncHandler(async (req, res) => {
    const me = await User.findById(req.user._id).select("verification").lean();

    return res.render("verification/form", {
        title: "Get verified | BoviNetra",
        user: req.user,
        verification: me?.verification || { status: "none" },
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

export const submitVerification = asyncHandler(async (req, res) => {
    try {
        const me = await User.findById(req.user._id).select("verification");
        const status = me.verification?.status || "none";

        if (status === "verified") {
            return reject(req, res, { status: 409, message: "You are already verified", redirectTo: HOME });
        }

        if (status === "pending") {
            return reject(req, res, { status: 409, message: "Your request is already being reviewed", redirectTo: HOME });
        }

        const phone = queryString(req.body?.phone, 15).replace(/[\s-]/g, "").replace(/^\+?91/, "");

        if (!PHONE.test(phone)) {
            return reject(req, res, { status: 400, message: "Enter a valid 10 digit mobile number", redirectTo: HOME });
        }

        if (!req.file) {
            return reject(req, res, { status: 400, message: "Upload a clear photo of your farm", redirectTo: HOME });
        }

        const uploaded = await uploadOnCloudinary(req.file.path, {
            folder: "bovinetra/verification",
            resource_type: "image"
        });

        const url = uploaded?.secure_url;

        if (!url) throw new ApiError(502, "Could not upload the photo. Please try again.");

        me.verification = {
            status: "pending",
            phone,
            farmPhotoUrl: url,
            submittedAt: new Date()
        };

        await me.save();

        return respond(req, res, {
            status: 201,
            redirectTo: HOME,
            data: { status: "pending" },
            message: "Request sent. We will review it soon."
        });
    } finally {
        await dropUpload(req);
    }
});

export const listVerifications = asyncHandler(async (req, res) => {
    const status = ["pending", "verified", "rejected"].includes(req.query.status) ? req.query.status : "pending";

    const farmers = await User.find({ role: "farmer", "verification.status": status })
        .select("fullName username email avatar farmerDetails verification")
        .sort({ "verification.submittedAt": 1 })
        .limit(100)
        .lean();

    return res.render("admin/verifications", {
        title: "Verifications | BoviNetra",
        user: req.user,
        farmers,
        status,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const decide = async (req, res, nextStatus, message) => {
    if (!isObjectId(req.params.id)) throw new ApiError(400, "Invalid user id");

    const farmer = await User.findOne({ _id: req.params.id, role: "farmer" });

    if (!farmer || farmer.verification?.status !== "pending") {
        return reject(req, res, {
            status: 404,
            message: "No pending request for this farmer",
            redirectTo: "/admin/verifications"
        });
    }

    farmer.verification.status = nextStatus;
    farmer.verification.note = queryString(req.body?.note, 300);
    farmer.verification.reviewedAt = new Date();
    farmer.verification.reviewedBy = req.user._id;
    await farmer.save();

    await notify(farmer._id, {
        type: "verification",
        title: nextStatus === "verified" ? "You are now a verified farmer" : "Your verification was not approved",
        body: nextStatus === "verified" ? "A verified badge now shows on your profile and reels." : farmer.verification.note,
        link: HOME
    });

    return respond(req, res, { redirectTo: "/admin/verifications", data: {}, message });
};

export const approveVerification = asyncHandler((req, res) =>
    decide(req, res, "verified", "Farmer verified")
);

export const rejectVerification = asyncHandler((req, res) =>
    decide(req, res, "rejected", "Request rejected")
);
