import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { getAllCattle, getCattleById } from "../controllers/cattle.controller.js";

const router = Router();

router.use(verifyJWT);

router.get("/", getAllCattle);
router.get("/:id", getCattleById);

export default router;