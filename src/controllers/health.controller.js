import fs from "fs";
import { v2 as cloudinary } from "cloudinary";

import { Cattle, HEALTH_RECORD_KINDS, MAX_HEALTH_RECORDS } from "../models/cattle.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, reject, respond } from "../utils/http.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { cleanFileName, contentMatchesType, readFileHead } from "../middlewares/chatUpload.middleware.js";

const dropUpload = async (req) => {
    if (req.file?.path) await fs.promises.unlink(req.file.path).catch(() => {});
};

const findOwned = async (id, userId) => {
    if (!isObjectId(id)) throw new ApiError(400, "Invalid cattle id");

    const cattle = await Cattle.findOne({ _id: id, farmer: userId, isDeleted: { $ne: true } });

    if (!cattle) throw new ApiError(404, "Cattle not found");

    return cattle;
};

export const addHealthRecord = asyncHandler(async (req, res) => {
    try {
        const cattle = await findOwned(req.params.id, req.user._id);
        const back = `/farmer/cattle/${cattle._id}`;

        const title = queryString(req.body?.title, 100);
        const date = new Date(String(req.body?.date || ""));
        const kind = HEALTH_RECORD_KINDS.includes(req.body?.kind) ? req.body.kind : "other";

        if (title.length < 2) {
            return reject(req, res, { status: 400, message: "Give the record a title", redirectTo: back });
        }

        if (Number.isNaN(date.getTime()) || date.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
            return reject(req, res, { status: 400, message: "Enter a valid date that is not in the future", redirectTo: back });
        }

        if (cattle.healthRecords.length >= MAX_HEALTH_RECORDS) {
            return reject(req, res, {
                status: 400,
                message: `You can add up to ${MAX_HEALTH_RECORDS} records. Delete an old one first.`,
                redirectTo: back
            });
        }

        const record = {
            kind,
            title,
            date,
            notes: queryString(req.body?.notes, 500)
        };

        if (req.file) {
            const head = await readFileHead(req.file.path);

            if (!contentMatchesType(req.file.mimetype, head)) {
                return reject(req, res, { status: 400, message: "That file does not look valid", redirectTo: back });
            }

            const isPdf = req.file.mimetype === "application/pdf";

            const uploaded = await uploadOnCloudinary(req.file.path, {
                folder: "bovinetra/health",
                resource_type: isPdf ? "raw" : "image",
                use_filename: true,
                unique_filename: true
            });

            if (!uploaded?.secure_url) throw new ApiError(502, "Could not upload the file. Please try again.");

            record.fileUrl = uploaded.secure_url;
            record.publicId = uploaded.public_id;
            record.fileKind = isPdf ? "pdf" : "image";
            record.fileName = cleanFileName(req.file.originalname, req.file.mimetype).slice(0, 150);
        }

        cattle.healthRecords.push(record);
        await cattle.save();

        return respond(req, res, {
            status: 201,
            redirectTo: back,
            data: {},
            message: "Health record added"
        });
    } finally {
        await dropUpload(req);
    }
});

export const deleteHealthRecord = asyncHandler(async (req, res) => {
    const cattle = await findOwned(req.params.id, req.user._id);
    const back = `/farmer/cattle/${cattle._id}`;

    if (!isObjectId(req.params.recordId)) throw new ApiError(400, "Invalid record id");

    const record = cattle.healthRecords.id(req.params.recordId);

    if (!record) {
        return reject(req, res, { status: 404, message: "Record not found", redirectTo: back });
    }

    if (record.publicId) {
        await cloudinary.uploader
            .destroy(record.publicId, { resource_type: record.fileKind === "pdf" ? "raw" : "image", invalidate: true })
            .catch((error) => console.error("[health] could not delete file:", error.message));
    }

    record.deleteOne();
    await cattle.save();

    return respond(req, res, { redirectTo: back, data: {}, message: "Record deleted" });
});
