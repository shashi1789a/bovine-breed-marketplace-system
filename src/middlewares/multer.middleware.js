import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

import { ApiError } from "../utils/ApiError.js";

const UPLOAD_DIR = path.join(process.cwd(), "tmp", "uploads");
const MAX_FILE_SIZE = 5 * 1024 * 1024;
const MAX_FILES = 10;

const EXTENSIONS = Object.freeze({
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif"
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = crypto.randomBytes(12).toString("hex");
        cb(null, `${Date.now()}-${unique}${EXTENSIONS[file.mimetype]}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(EXTENSIONS, file.mimetype)) {
        return cb(new ApiError(400, "Only JPG, PNG, WEBP or GIF images are allowed."));
    }

    return cb(null, true);
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: MAX_FILES
    }
});