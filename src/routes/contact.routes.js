import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
    showContactPage,
    submitContact
} from "../controllers/contact.controller.js";

const router = Router();

const contactLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5
});

router.get("/contact-us", showContactPage);
router.post("/contact-us", contactLimiter, submitContact);

export default router;