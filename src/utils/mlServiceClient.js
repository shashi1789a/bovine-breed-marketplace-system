import { promises as fs } from "fs";
import axios from "axios";
import FormData from "form-data";

import { ApiError } from "./ApiError.js";

const DEFAULT_TIMEOUT_MS = 45000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 3000;

const RETRYABLE_CODES = new Set([
    "ECONNREFUSED",
    "ECONNRESET",
    "ECONNABORTED",
    "ETIMEDOUT",
    "ENOTFOUND"
]);

const RETRYABLE_STATUSES = new Set([502, 503, 504]);
const REJECTED_IMAGE_STATUSES = new Set([400, 413, 415, 422]);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readConfig = () => {
    const fallback =
        process.env.NODE_ENV === "production" ? "" : "http://localhost:8001";

    const baseURL = (process.env.ML_SERVICE_URL || fallback).replace(/\/+$/, "");

    if (!baseURL) {
        throw new ApiError(503, "Breed detection is not configured.");
    }

    return {
        baseURL,
        apiKey: process.env.ML_API_KEY || "",
        timeout: Number(process.env.ML_SERVICE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS
    };
};

const isRetryable = (error) =>
    RETRYABLE_CODES.has(error.code) ||
    RETRYABLE_STATUSES.has(error.response?.status);

const toApiError = (error) => {
    const status = error.response?.status;

    if (REJECTED_IMAGE_STATUSES.has(status)) {
        return new ApiError(
            422,
            "We could not process this image. Please try a clearer JPG or PNG photo."
        );
    }

    if (status === 401 || status === 403) {
        console.error("[ml-service] request rejected, check ML_API_KEY");
        return new ApiError(
            502,
            "Breed detection is misconfigured. Please contact support."
        );
    }

    console.error("[ml-service] request failed:", error.code || status || error.message);

    return new ApiError(
        503,
        "Breed detection is temporarily unavailable. Please try again in a minute."
    );
};

const normalizePrediction = (data) => {
    const breed = typeof data?.breed === "string" ? data.breed.trim() : "";
    const confidence = Number(data?.confidence);

    if (!breed || !Number.isFinite(confidence)) {
        throw new ApiError(502, "Breed detection returned an invalid response.");
    }

    return {
        breed,
        confidence: Math.min(Math.max(confidence, 0), 100),
        info: data.info && typeof data.info === "object" ? data.info : {}
    };
};

const requestPrediction = async ({ filePath, filename, mimetype }) => {
    const { baseURL, apiKey, timeout } = readConfig();
    const buffer = await fs.readFile(filePath);

    for (let attempt = 1; ; attempt++) {
        const form = new FormData();
        form.append("image", buffer, { filename, contentType: mimetype });

        try {
            const { data } = await axios.post(`${baseURL}/predict`, form, {
                headers: {
                    ...form.getHeaders(),
                    ...(apiKey && { "X-API-Key": apiKey })
                },
                timeout,
                maxBodyLength: Infinity
            });

            return normalizePrediction(data);
        } catch (error) {
            if (error instanceof ApiError) throw error;

            if (attempt < MAX_ATTEMPTS && isRetryable(error)) {
                await wait(RETRY_DELAY_MS);
                continue;
            }

            throw toApiError(error);
        }
    }
};

export { requestPrediction };