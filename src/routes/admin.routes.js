import { Router } from "express";

import { verifyJWT, isAdmin } from "../middlewares/auth.middleware.js";

import {
    adminDashboard,
    listUsers,
    updateUserRole,
    updateUserStatus,
    listProducts,
    approveProduct,
    rejectProduct,
    setProductFeatured,
    deleteProductByAdmin
} from "../controllers/admin.controller.js";
import { showAnalytics } from "../controllers/analytics.controller.js";
import {
    approveVerification,
    listVerifications,
    rejectVerification
} from "../controllers/verification.controller.js";

const router = Router();

router.use(verifyJWT, isAdmin);

router.get("/dashboard", adminDashboard);

router.get("/analytics", showAnalytics);

router.get("/users", listUsers);
router.post("/users/:id/role", updateUserRole);
router.post("/users/:id/status", updateUserStatus);

router.get("/products", listProducts);
router.post("/products/:id/approve", approveProduct);
router.post("/products/:id/reject", rejectProduct);
router.post("/products/:id/feature", setProductFeatured);
router.post("/products/:id/delete", deleteProductByAdmin);

router.get("/verifications", listVerifications);
router.post("/verifications/:id/approve", approveVerification);
router.post("/verifications/:id/reject", rejectVerification);

export default router;