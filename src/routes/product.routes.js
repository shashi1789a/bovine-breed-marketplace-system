import { Router } from "express";

import {
    addProduct,
    showAddProductPage,
    showEditProductPage,
    getAllProducts,
    getMyProducts,
    getProductById,
    updateProduct,
    getProductDetails,
    deleteProduct,
    searchProducts,
    filterProductsByCategory
} from "../controllers/product.controller.js";

import { MAX_GALLERY_IMAGES } from "../models/product.model.js";
import { verifyJWT, optionalAuth } from "../middlewares/auth.middleware.js";
import { canManageProducts } from "../middlewares/product.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";

const router = Router();

const productImages = upload.fields([
    { name: "image", maxCount: 1 },
    { name: "images", maxCount: MAX_GALLERY_IMAGES }
]);

/* Browsing is open to everyone. optionalAuth still loads the user when someone is logged in. */
router.get("/", optionalAuth, getAllProducts);
router.get("/marketplace", optionalAuth, getAllProducts);
router.get("/search", optionalAuth, searchProducts);
router.get("/category/:category", optionalAuth, filterProductsByCategory);
router.get("/view/:id", optionalAuth, getProductById);
router.get("/details/:id", optionalAuth, getProductDetails);

/* Everything below needs a login. */
router.use(verifyJWT);

router.get("/my", canManageProducts, getMyProducts);

router.get("/add", canManageProducts, showAddProductPage);
router.post("/add", canManageProducts, productImages, addProduct);

router.get("/edit/:id", canManageProducts, showEditProductPage);
router.post("/edit/:id", canManageProducts, productImages, updateProduct);

router.post("/delete/:id", canManageProducts, deleteProduct);

export default router;