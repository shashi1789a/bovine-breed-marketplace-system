import { Router } from "express";

import userRoutes from "./user.routes.js";
import dashboardRoutes from "./dashboard.routes.js";
import adminRoutes from "./admin.routes.js";
import { farmerRouter, doctorRouter } from "./seller.routes.js";
import productRoutes from "./product.routes.js";
import cattleRoutes from "./cattle.routes.js";
import cartRoutes from "./cart.routes.js";
import orderRoutes from "./order.routes.js";
import healthcheckRoutes from "./healthcheck.routes.js";

const router = Router();

router.use("/healthz", healthcheckRoutes);

router.use("/", userRoutes);
router.use("/", dashboardRoutes);
router.use("/admin", adminRoutes);
router.use("/farmer", farmerRouter);
router.use("/doctor", doctorRouter);
router.use("/products", productRoutes);
router.use("/cattle", cattleRoutes);
router.use("/cart", cartRoutes);
router.use("/orders", orderRoutes);

export default router;