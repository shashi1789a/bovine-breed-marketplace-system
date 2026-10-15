import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { discardUploads } from "../utils/uploads.js";
import { isObjectId } from "../utils/http.js";
import { requestPrediction } from "../utils/mlServiceClient.js";
import { Prediction } from "../models/prediction.model.js";

const HISTORY_LIMIT = 20;

const renderDetect = (req, res, { status = 200, error = null } = {}) =>
    res.status(status).render("breed/detect", {
        title: "AI Cow Breed Detector",
        user: req.user,
        error
    });

const renderNotFound = (req, res) =>
    res.status(404).render("404", { title: "Result Not Found", user: req.user });

const showDetectPage = (req, res) => renderDetect(req, res);

const predictBreed = asyncHandler(async (req, res) => {
    if (!req.file) {
        return renderDetect(req, res, {
            status: 400,
            error: "Please select or capture an image first."
        });
    }

    try {
        const result = await requestPrediction({
            filePath: req.file.path,
            filename: req.file.originalname,
            mimetype: req.file.mimetype
        });

        const uploaded = await uploadOnCloudinary(req.file.path, {
            folder: "bovinetra/predictions"
        });

        const prediction = await Prediction.create({
            user: req.user?._id || null,
            breed: result.breed,
            confidence: result.confidence,
            info: result.info,
            imageUrl: uploaded?.secure_url || "",
            source: req.body?.source === "camera" ? "camera" : "upload"
        });

        return res.redirect(`/breed/result/${prediction._id}`);
    } catch (error) {
        if (!(error instanceof ApiError)) throw error;

        return renderDetect(req, res, {
            status: error.statusCode,
            error: error.message
        });
    } finally {
        await discardUploads(req);
    }
});

const showResultPage = asyncHandler(async (req, res) => {
    if (!isObjectId(req.params.id)) return renderNotFound(req, res);

    const prediction = await Prediction.findById(req.params.id).lean();

    if (!prediction) return renderNotFound(req, res);

    const ownerId = prediction.user ? String(prediction.user) : null;
    const viewerId = req.user?._id ? String(req.user._id) : null;

    if (ownerId && ownerId !== viewerId) return renderNotFound(req, res);

    return res.status(200).render("breed/result", {
        title: `${prediction.breed} - Breed Result`,
        user: req.user,
        prediction: prediction.breed,
        confidence: prediction.confidence,
        info: prediction.info,
        imageUrl: prediction.imageUrl
    });
});

const getPredictionHistory = asyncHandler(async (req, res) => {
    const history = await Prediction.find({ user: req.user._id })
        .select("breed confidence imageUrl createdAt")
        .sort({ createdAt: -1 })
        .limit(HISTORY_LIMIT)
        .lean();

    return res
        .status(200)
        .json(new ApiResponse(200, history, "Prediction history fetched successfully"));
});

export { showDetectPage, predictBreed, showResultPage, getPredictionHistory };