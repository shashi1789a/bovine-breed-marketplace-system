import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

const esc = (s = "") =>
    String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

export const sendContactMail = async (c) => {
    await transporter.sendMail({
        from: `"BoviNetra Website" <${process.env.SMTP_USER}>`,
        to: process.env.MAIL_TO,
        replyTo: c.email,
        subject: `New Contact: ${c.subject} - ${c.name}`,
        html: `
            <h3>New message from website</h3>
            <p><b>Name:</b> ${esc(c.name)}</p>
            <p><b>Email:</b> ${esc(c.email)}</p>
            <p><b>Phone:</b> ${esc(c.phone) || "-"}</p>
            <p><b>Business Type:</b> ${esc(c.businessType) || "-"}</p>
            <p><b>Subject:</b> ${esc(c.subject)}</p>
            <p><b>Message:</b><br>${esc(c.message).replace(/\n/g, "<br>")}</p>
        `
    });
};