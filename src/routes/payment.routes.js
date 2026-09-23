import { Router } from "express";
import express from "express";

import { razorpayWebhook } from "../controllers/order.controller.js";

const router = Router();

router.post("/razorpay/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

export default router;