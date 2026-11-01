import Contact from "../models/contact.model.js";
import { sendContactMail } from "../utils/mailer.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const readText = (value, max) => (typeof value === "string" ? value.trim().slice(0, max) : "");

const submitContactApi = asyncHandler(async (req, res) => {
    const body = req.body || {};

    if (readText(body.website, 200)) {
        return res.status(200).json(new ApiResponse(200, {}, "Message received"));
    }

    const name = `${readText(body.first_name, 60)} ${readText(body.last_name, 60)}`.trim();
    const email = readText(body.email, 254);
    const subject = readText(body.subject, 200);
    const message = readText(body.message, 5000);

    if (!name || !email || !subject || !message) {
        throw new ApiError(400, "Name, email, subject and message are required.");
    }

    if (!EMAIL_PATTERN.test(email)) {
        throw new ApiError(400, "Enter a valid email address.");
    }

    const contact = await Contact.create({
        name,
        email,
        phone: readText(body.phone, 20),
        businessType: readText(body.business_type, 80),
        subject,
        message
    });

    try {
        await sendContactMail(contact);
    } catch (error) {
        console.error("Contact email failed:", error);
    }

    return res.status(201).json(new ApiResponse(201, {}, "Message received"));
});

export { submitContactApi };
