import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

import { ApiError } from "../utils/ApiError.js";
import { CHAT_FILE_TYPES, MAX_CHAT_FILE_SIZE } from "./chatUpload.middleware.js";

const UPLOAD_DIR = path.join(process.cwd(), "tmp", "uploads");

export const HEALTH_FILE_TYPES = Object.freeze(
    ["application/pdf", "image/jpeg", "image/png", "image/webp"].filter((type) => CHAT_FILE_TYPES[type])
);

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) =>
        cb(null, `health-${Date.now()}-${crypto.randomBytes(12).toString("hex")}${CHAT_FILE_TYPES[file.mimetype]?.[0] || ""}`)
});

const uploader = multer({
    storage,
    fileFilter: (req, file, cb) =>
        HEALTH_FILE_TYPES.includes(file.mimetype)
            ? cb(null, true)
            : cb(new ApiError(400, "Attach a PDF or a JPG, PNG or WEBP image.")),
    limits: { fileSize: MAX_CHAT_FILE_SIZE, files: 1, fields: 8, fieldSize: 2000 }
}).single("file");

export const healthUploadHandler = (req, res, next) => {
    uploader(req, res, (error) => {
        if (!error) return next();

        if (error.code === "LIMIT_FILE_SIZE") return next(new ApiError(413, "File is too large. The limit is 10 MB."));
        if (error.name === "MulterError") return next(new ApiError(400, "Could not read that upload."));

        return next(error);
    });
};
