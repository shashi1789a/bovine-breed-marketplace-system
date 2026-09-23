import { Router } from "express";

import { verifyJWT, authorizeRoles } from "../middlewares/auth.middleware.js";

import {
    dashboardHome,
    farmerDashboard,
    doctorDashboard,
    buyerDashboard,
    getDashboardData
} from "../controllers/dashboard.controller.js";

const router = Router();

router.get("/dashboard", verifyJWT, dashboardHome);
router.get("/farmer/dashboard", verifyJWT, farmerDashboard);
router.get("/doctor/dashboard", verifyJWT, doctorDashboard);
router.get("/buyer/dashboard", verifyJWT, buyerDashboard);

router.get(
    "/api/v1/dashboard/data",
    verifyJWT,
    authorizeRoles("farmer", "doctor", "buyer", "user"),
    getDashboardData
);

export default router;