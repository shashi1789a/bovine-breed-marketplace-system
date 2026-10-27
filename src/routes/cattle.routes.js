import { Router } from "express";

import { optionalAuth } from "../middlewares/auth.middleware.js";
import { getAllCattle, getCattleById } from "../controllers/cattle.controller.js";

const router = Router();

/* Anyone can browse cattle. Logged-in users are still recognised (owner / admin views). */
router.use(optionalAuth);

router.get("/", getAllCattle);
router.get("/:id", getCattleById);

export default router;
