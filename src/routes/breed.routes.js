// src/routes/breed.routes.js
import { Router } from "express";
import multer from "multer";
import {
    renderDetectPage,
    predictBreed,
    getPredictionHistory
} from "../controllers/breed.controller.js";

const router = Router();
const upload = multer({ dest: "uploads/tmp/" });

router.get("/detect", renderDetectPage);
router.post("/predict", upload.single("image"), predictBreed);
router.get("/history", getPredictionHistory);

export default router;