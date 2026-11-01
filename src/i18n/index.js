import { hi } from "./hi.js";
import { safeRedirect } from "../utils/http.js";

export const LANGUAGES = Object.freeze(["en", "hi"]);
export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_COOKIE = "lang";

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const dictionaries = Object.freeze({ en: {}, hi });

export const pickLanguage = (cookieValue, acceptLanguage) => {
    if (LANGUAGES.includes(cookieValue)) return cookieValue;

    const first = String(acceptLanguage || "").split(",")[0].trim().toLowerCase();

    return first.startsWith("hi") ? "hi" : DEFAULT_LANGUAGE;
};

export const translate = (lang, key, params) => {
    const table = dictionaries[lang] || dictionaries[DEFAULT_LANGUAGE];
    let text = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : key;

    if (params && typeof params === "object") {
        text = text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
    }

    return text;
};

export const i18nMiddleware = (req, res, next) => {
    const lang = pickLanguage(req.cookies?.[LANGUAGE_COOKIE], req.headers["accept-language"]);

    req.lang = lang;
    res.locals.lang = lang;
    res.locals.t = (key, params) => translate(lang, key, params);
    res.setHeader("Content-Language", lang);

    next();
};

const returnTarget = (req) => {
    if (typeof req.query.next === "string") return safeRedirect(req.query.next, "/");

    try {
        const url = new URL(req.get("referer") || "", `${req.protocol}://${req.get("host")}`);

        return url.host === req.get("host") ? safeRedirect(url.pathname + url.search, "/") : "/";
    } catch {
        return "/";
    }
};

export const setLanguage = (req, res) => {
    const code = String(req.params.code || "").toLowerCase();

    if (!LANGUAGES.includes(code)) return res.redirect(returnTarget(req));

    res.cookie(LANGUAGE_COOKIE, code, {
        maxAge: ONE_YEAR_MS,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        httpOnly: false,
        path: "/"
    });

    return res.redirect(returnTarget(req));
};
