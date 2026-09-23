// src/controllers/breed.controller.js
import fs from "fs";
import axios from "axios";
import FormData from "form-data";
import Prediction from "../models/prediction.model.js";

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:8001";

export const renderDetectPage = (req, res) => {
    res.render("breed/detect", { error: null });
};

export const predictBreed = async (req, res) => {
    if (!req.file) {
        return res.render("breed/detect", {
            error: "Please select or capture an image first"
        });
    }

    const tempPath = req.file.path;

    try {
        const form = new FormData();
        form.append("image", fs.createReadStream(tempPath), req.file.originalname);

        const { data } = await axios.post(`${ML_SERVICE_URL}/predict`, form, {
            headers: form.getHeaders(),
            timeout: 15000
        });

        const prediction = await Prediction.create({
            user: req.user?._id || null,
            breed: data.breed,
            confidence: data.confidence,
            info: data.info,
            imagePath: data.image_path,
            source: req.body.source === "camera" ? "camera" : "upload"
        });

        fs.unlink(tempPath, () => {});

        return res.render("breed/result", {
            prediction: prediction.breed,
            confidence: prediction.confidence,
            info: prediction.info,
            imagePath: prediction.imagePath
        });
    } catch (err) {
        fs.unlink(tempPath, () => {});

        const message =
            err.code === "ECONNREFUSED"
                ? "AI service is currently unavailable, please try again later"
                : "Prediction failed, please try again";

        return res.render("breed/detect", { error: message });
    }
};

export const getPredictionHistory = async (req, res) => {
    if (!req.user?._id) {
        return res.status(401).json({ success: false, message: "Login required" });
    }

    const history = await Prediction.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .limit(20);

    return res.json({ success: true, data: history });
};