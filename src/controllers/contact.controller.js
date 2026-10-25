import Contact from "../models/contact.model.js";
import { sendContactMail } from "../utils/mailer.js";

export const showContactPage = (req, res) => {
    res.render("pages/contact-us", {
        title: "BoviNetra | Contact Us",
        success: req.query.success === "1",
        error: req.query.error === "1"
    });
};

export const submitContact = async (req, res) => {
    try {
        const { first_name, last_name, email, phone, subject, message, business_type, website } = req.body;

        // honeypot: bots ye hidden field bhar dete hain
        if (website) return res.redirect("/contact-us?success=1");

        const name = `${first_name || ""} ${last_name || ""}`.trim();

        if (!name || !email?.trim() || !subject?.trim() || !message?.trim()) {
            return res.redirect("/contact-us?error=1");
        }

        const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!validEmail.test(email.trim())) {
            return res.redirect("/contact-us?error=1");
        }

        const contact = await Contact.create({
            name,
            email: email.trim(),
            phone: phone?.trim() || "",
            businessType: business_type?.trim() || "",
            subject: subject.trim(),
            message: message.trim()
        });

        // Email fail ho to bhi message DB me safe rahe
        try {
            await sendContactMail(contact);
        } catch (mailErr) {
            console.error("Contact email failed:", mailErr);
        }

        return res.redirect("/contact-us?success=1");
    } catch (error) {
        console.error(error);
        return res.redirect("/contact-us?error=1");
    }
};