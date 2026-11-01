
export const MAX_REEL_SECONDS = 60;
export const MAX_REEL_BYTES = 80 * 1024 * 1024;
export const MAX_CAPTION_LENGTH = 150;
export const MAX_REELS_PER_CATTLE = 3;

export const REEL_TYPES = Object.freeze({
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm"
});

const startsWith = (buffer, bytes, offset = 0) =>
    bytes.every((byte, index) => buffer[offset + index] === byte);

export const videoMatchesType = (mimeType, head) => {
    if (!head || head.length < 12) return false;

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
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, MAX_CAPTION_LENGTH);

const isCloudinaryUpload = (url) =>
    typeof url === "string" && /^https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\//.test(url);

export const STREAM_TRANSFORMATION = "q_auto,w_720,c_limit";

export const streamUrlFor = (url) =>
    isCloudinaryUpload(url) ? url.replace("/video/upload/", `/video/upload/${STREAM_TRANSFORMATION}/`) : url;

export const posterUrlFor = (url) =>
    isCloudinaryUpload(url)
        ? url
              .replace("/video/upload/", "/video/upload/so_1,w_540,h_960,c_fill,q_auto/")
              .replace(/\.[a-z0-9]+(\?.*)?$/i, ".jpg")
        : "";
