import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    addToCart,
    getMyCart,
    updateCartItem,
    removeCartItem,
    clearCart
} from "../controllers/cart.controller.js";

const router = Router();

router.use(verifyJWT);

router.get("/", getMyCart);
router.post("/clear", clearCart);
router.post("/:productId/add", addToCart);
router.post("/:productId/update", updateCartItem);
router.post("/:productId/remove", removeCartItem);

export default router;