import fs from "fs";
import path from "path";
import crypto from "crypto";
import multer from "multer";

import { ApiError } from "../utils/ApiError.js";

const UPLOAD_DIR = path.join(process.cwd(), "tmp", "uploads");
export const MAX_CHAT_FILE_SIZE = 10 * 1024 * 1024;

/* mime type -> [extension, shown as a picture?]. SVG and scripts are left out on purpose. */
export const CHAT_FILE_TYPES = Object.freeze({
    "image/jpeg": [".jpg", true],
    "image/png": [".png", true],
    "image/webp": [".webp", true],
    "image/gif": [".gif", true],
    "application/pdf": [".pdf", false],
    "application/msword": [".doc", false],
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx", false],
    "application/vnd.ms-excel": [".xls", false],
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", false],
    "application/vnd.ms-powerpoint": [".ppt", false],
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx", false],
    "text/plain": [".txt", false],
    "text/csv": [".csv", false]
});

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        const unique = crypto.randomBytes(12).toString("hex");
        const extension = CHAT_FILE_TYPES[file.mimetype]?.[0] || "";

        cb(null, `chat-${Date.now()}-${unique}${extension}`);
    }
});

const fileFilter = (req, file, cb) => {
    if (!Object.prototype.hasOwnProperty.call(CHAT_FILE_TYPES, file.mimetype)) {
        return cb(
            new ApiError(400, "This file type is not allowed. Send an image, PDF, Word, Excel, PowerPoint, TXT or CSV file.")
        );
    }

    return cb(null, true);
};

export const chatUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAX_CHAT_FILE_SIZE, files: 1, fields: 5 }
}).single("file");

/* Turns multer's own errors into messages a person can read. */
export const chatUploadHandler = (req, res, next) => {
    chatUpload(req, res, (error) => {
        if (!error) return next();

        if (error.code === "LIMIT_FILE_SIZE") {
            return next(new ApiError(413, "File is too large. The limit is 10 MB."));
        }

        if (error.name === "MulterError") {
            return next(new ApiError(400, "Could not read that upload. Send one file at a time."));
        }

        return next(error);
    });
};

const startsWith = (buffer, bytes, offset = 0) =>
    bytes.every((byte, index) => buffer[offset + index] === byte);

/* The browser's mime type is only a claim, so check the first bytes of the file too. */
export const contentMatchesType = (mimeType, head) => {
    switch (mimeType) {
        case "image/jpeg":
            return startsWith(head, [0xff, 0xd8, 0xff]);
        case "image/png":
            return startsWith(head, [0x89, 0x50, 0x4e, 0x47]);
        case "image/gif":
            return startsWith(head, [0x47, 0x49, 0x46, 0x38]);
        case "image/webp":
            return startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8);
        case "application/pdf":
            return startsWith(head, [0x25, 0x50, 0x44, 0x46]);
        case "application/msword":
        case "application/vnd.ms-excel":
        case "application/vnd.ms-powerpoint":
            return startsWith(head, [0xd0, 0xcf, 0x11, 0xe0]);
        case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
        case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
            return startsWith(head, [0x50, 0x4b, 0x03, 0x04]);
        case "text/plain":
        case "text/csv":
            return !head.includes(0x00);
        default:
            return false;
    }
};

export const readFileHead = async (filePath, length = 512) => {
    const handle = await fs.promises.open(filePath, "r");

    try {
        const buffer = Buffer.alloc(length);
        const { bytesRead } = await handle.read(buffer, 0, length, 0);

        return buffer.subarray(0, bytesRead);
    } finally {
        await handle.close();
    }
};

/* multer reads the name as latin1; restore UTF-8 (Hindi etc.) and drop path and control characters. */
export const cleanFileName = (rawName, mimeType) => {
    const decoded = Buffer.from(String(rawName || ""), "latin1").toString("utf8");

    const base = path
        .basename(decoded.replace(/\\/g, "/"))
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
        .trim()
        .slice(-120);

    return base || `file${CHAT_FILE_TYPES[mimeType]?.[0] || ""}`;
};
