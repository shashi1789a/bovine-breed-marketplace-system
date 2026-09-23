import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    showCheckoutPage,
    placeOrderCOD,
    createRazorpayCheckout,
    verifyRazorpayPayment,
    myOrders,
    getOrderById,
    cancelOrder
} from "../controllers/order.controller.js";

const router = Router();

router.use(verifyJWT);

router.get("/checkout", showCheckoutPage);
router.post("/checkout/cod", placeOrderCOD);
router.post("/checkout/razorpay", createRazorpayCheckout);
router.post("/checkout/razorpay/verify", verifyRazorpayPayment);

router.get("/", myOrders);
router.get("/:id", getOrderById);
router.post("/:id/cancel", cancelOrder);

export default router;