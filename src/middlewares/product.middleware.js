import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { SELLER_ROLES } from "../models/product.model.js";

export const canManageProducts = asyncHandler(async (req, res, next) => {
    if (!req.user) {
        throw new ApiError(401, "Please login to continue.");
    }

    const role = req.user.role?.toLowerCase();

    if (!SELLER_ROLES.includes(role)) {
        throw new ApiError(403, "You are not authorized to manage products.");
    }

    next();
});