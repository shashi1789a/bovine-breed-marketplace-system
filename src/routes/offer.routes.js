import { Router } from "express";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import {
    acceptOffer,
    createOffer,
    listOffers,
    rejectOffer,
    withdrawOffer
} from "../controllers/offer.controller.js";
import { userLimiter } from "../utils/limiter.js";

const router = Router();

router.use(verifyJWT);

router.get("/", listOffers);
router.post(
    "/",
    userLimiter({ windowMs: 60 * 60 * 1000, limit: 15, message: "Too many offers. Please try again later." }),
    createOffer
);
router.post("/:id/accept", acceptOffer);
router.post("/:id/reject", rejectOffer);
router.post("/:id/withdraw", withdrawOffer);

export default router;
