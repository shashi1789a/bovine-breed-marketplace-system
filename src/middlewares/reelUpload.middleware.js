import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

import { ApiError } from "../utils/ApiError.js";
import { MAX_REEL_BYTES, REEL_TYPES } from "../utils/reel.helpers.js";

const UPLOAD_DIR = path.join(process.cwd(), "tmp", "uploads");

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = crypto.randomBytes(12).toString("hex");
        cb(null, `reel-${Date.now()}-${unique}${REEL_TYPES[file.mimetype] || ""}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(REEL_TYPES, file.mimetype)) {
        return cb(new ApiError(400, "Upload an MP4, MOV or WEBM video."));
    }

    return cb(null, true);
};

const uploader = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_REEL_BYTES, files: 1, fields: 6, fieldSize: 2000 }
}).single("video");

/* Turns multer's own errors into messages a person can read. */
export const reelUploadHandler = (req, res, next) => {
    uploader(req, res, (error) => {
        if (!error) return next();

        if (error.code === "LIMIT_FILE_SIZE") {
            return next(new ApiError(413, "That video is too large. The limit is 80 MB."));
        }

        if (error.name === "MulterError") {
            return next(new ApiError(400, "Could not read that upload. Send one video."));
        }

        return next(error);
    });
};

export const discardReelUpload = async (req) => {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
};
