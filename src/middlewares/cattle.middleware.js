import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { CATTLE_MANAGER_ROLES } from "../models/cattle.model.js";

export const canManageCattle = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Please login to continue.");
    }

    const role = req.user.role?.toLowerCase();

    if (!CATTLE_MANAGER_ROLES.includes(role)) {
        throw new ApiError(403, "You are not authorized to manage cattle.");
    }

    next();
});