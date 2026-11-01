import { Router } from "express";

import { verifyJWT, isFarmer, isDoctor, isSeller } from "../middlewares/auth.middleware.js";
import { canManageCattle } from "../middlewares/cattle.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import { healthUploadHandler } from "../middlewares/healthUpload.middleware.js";
import { addHealthRecord, deleteHealthRecord } from "../controllers/health.controller.js";
import { userLimiter } from "../utils/limiter.js";

import { MAX_CATTLE_IMAGES } from "../models/cattle.model.js";

import { getMyProducts } from "../controllers/product.controller.js";
import {
    sellerOrdersPage,
    getSellerOrderById,
    markOrderShipped,
    markOrderDelivered,
    sellerCancelOrder
} from "../controllers/seller.controller.js";
import {
    showAddCattlePage,
    showEditCattlePage,
    addCattle,
    listCattle,
    getCattleById,
    updateCattle,
    deleteCattle
} from "../controllers/cattle.controller.js";

const createSellerRouter = (roleGuard) => {
    const router = Router();
    const guard = [verifyJWT, roleGuard];

    router.get("/products", ...guard, getMyProducts);

    router.get("/orders", ...guard, sellerOrdersPage);
    router.get("/orders/:id", ...guard, getSellerOrderById);
    router.post("/orders/:id/ship", ...guard, markOrderShipped);
    router.post("/orders/:id/deliver", ...guard, markOrderDelivered);
    router.post("/orders/:id/cancel", ...guard, sellerCancelOrder);

    return router;
};

const farmerRouter = createSellerRouter(isFarmer);
const doctorRouter = createSellerRouter(isDoctor);
const sellerRouter = createSellerRouter(isSeller);

const cattleGuard = [verifyJWT, canManageCattle];
const cattleImages = upload.array("images", MAX_CATTLE_IMAGES);

farmerRouter.get("/cattle", ...cattleGuard, listCattle);
farmerRouter.get("/cattle/add", ...cattleGuard, showAddCattlePage);
farmerRouter.post("/cattle/add", ...cattleGuard, cattleImages, addCattle);
farmerRouter.get("/cattle/:id", ...cattleGuard, getCattleById);
farmerRouter.get("/cattle/:id/edit", ...cattleGuard, showEditCattlePage);
farmerRouter.post("/cattle/:id/edit", ...cattleGuard, cattleImages, updateCattle);
farmerRouter.post("/cattle/:id/delete", ...cattleGuard, deleteCattle);
farmerRouter.post(
    "/cattle/:id/health",
    ...cattleGuard,
    userLimiter({ windowMs: 60 * 60 * 1000, limit: 30, message: "Too many uploads. Please try again later." }),
    healthUploadHandler,
    addHealthRecord
);
farmerRouter.post("/cattle/:id/health/:recordId/delete", ...cattleGuard, deleteHealthRecord);

export { farmerRouter, doctorRouter, sellerRouter };