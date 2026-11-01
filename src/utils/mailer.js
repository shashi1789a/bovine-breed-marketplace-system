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

const baseUrl = () => {
    const explicit = process.env.APP_URL || String(process.env.CORS_ORIGIN || "").split(",")[0];
    return String(explicit || "").trim().replace(/\/+$/, "");
};

export const sendNotificationMail = async ({ to, name, title, body, link }) => {
    if (!to || !process.env.SMTP_HOST || !process.env.SMTP_USER) return;

    const base = baseUrl();
    const url = base && typeof link === "string" && link.startsWith("/") ? `${base}${link}` : "";
    const settings = base ? `${base}/account/preferences` : "";

    await transporter.sendMail({
        from: `"BoviNetra" <${process.env.SMTP_USER}>`,
        to,
        subject: String(title).slice(0, 150),
        text: [`Hi ${name || "there"},`, "", title, body || "", url ? `Open: ${url}` : "", settings ? `Email settings: ${settings}` : ""]
            .filter((line, index, all) => line || (all[index - 1] && all[index + 1] !== undefined))
            .join("\n"),
        html: `
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:16px">
                <p>Hi ${esc(name || "there")},</p>
                <h3 style="margin:8px 0">${esc(title)}</h3>
                ${body ? `<p style="color:#444">${esc(body)}</p>` : ""}
                ${url ? `<p><a href="${esc(url)}" style="display:inline-block;background:#176b45;color:#fff;padding:10px 18px;border-radius:24px;text-decoration:none">Open on BoviNetra</a></p>` : ""}
                ${settings ? `<p style="color:#888;font-size:12px">You can change email alerts in your <a href="${esc(settings)}">settings</a>.</p>` : ""}
            </div>
        `
    });
};
