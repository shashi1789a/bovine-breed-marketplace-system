/* Small pure helpers for the Reels feature. No database, no network. */

export const MAX_REEL_SECONDS = 60;
export const MAX_REEL_BYTES = 80 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 150;
export const MAX_REELS_PER_CATTLE = 3;

/* mime type -> file extension. Anything else is refused. */
export const REEL_TYPES = Object.freeze({
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm"
});

const startsWith = (buffer, bytes, offset = 0) =>
    bytes.every((byte, index) => buffer[offset + index] === byte);

/* The browser's mime type is only a claim, so look at the first bytes of the file as well. */
export const videoMatchesType = (mimeType, head) => {
    if (!head || head.length < 12) return false;

    /* MP4 and MOV both carry an "ftyp" box right after a 4 byte length. */
    const hasFtyp = startsWith(head, [0x66, 0x74, 0x79, 0x70], 4);

    switch (mimeType) {
        case "video/mp4":
        case "video/quicktime":
            return hasFtyp;
        case "video/webm":
            return startsWith(head, [0x1a, 0x45, 0xdf, 0xa3]);
        default:
            return false;
    }
};

export const cleanCaption = (value) =>
    String(value ?? "")
        // eslint-disable-next-line no-control-regex
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CAPTION_LENGTH);

const isCloudinaryUpload = (url) =>
    typeof url === "string" && /^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url);

/* A lighter 720p copy for phones. Cloudinary makes it the first time somebody asks for it. */
export const streamUrlFor = (url) =>
    isCloudinaryUpload(url) ? url.replace("/video/upload/", "/video/upload/q_auto,w_720,c_limit/") : url;

/* A still picture of the first second, shown while the video loads. */
export const posterUrlFor = (url) =>
    isCloudinaryUpload(url)
        ? url
              .replace("/video/upload/", "/video/upload/so_1,w_540,h_960,c_fill,q_auto/")
              .replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg")
        : "";
