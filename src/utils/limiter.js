import rateLimit from "express-rate-limit";

export const userLimiter = ({ windowMs, limit, message }) =>
    rateLimit({
        windowMs,
        limit,
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => String(req.user?._id || "anonymous"),
        validate: { keyGeneratorIpFallback: false },
        message: { success: false, message }
    });
