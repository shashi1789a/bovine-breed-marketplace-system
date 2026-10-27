import {
    cleanCaption,
    posterUrlFor,
    streamUrlFor,
    videoMatchesType,
    MAX_CAPTION_LENGTH
} from "../../src/utils/reel.helpers.js";

const mp4Head = Buffer.from([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0]);
const webmHead = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
const exeHead = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff", "latin1");

describe("videoMatchesType", () => {
    it("accepts real mp4, mov and webm headers", () => {
        expect(videoMatchesType("video/mp4", mp4Head)).toBe(true);
        expect(videoMatchesType("video/quicktime", mp4Head)).toBe(true);
        expect(videoMatchesType("video/webm", webmHead)).toBe(true);
    });

    it("rejects a program renamed to .mp4 and mismatched types", () => {
        expect(videoMatchesType("video/mp4", exeHead)).toBe(false);
        expect(videoMatchesType("video/webm", mp4Head)).toBe(false);
        expect(videoMatchesType("video/x-msvideo", mp4Head)).toBe(false);
        expect(videoMatchesType("video/mp4", Buffer.alloc(3))).toBe(false);
    });
});

describe("cleanCaption", () => {
    it("trims, collapses whitespace, strips control characters and caps the length", () => {
        expect(cleanCaption("  hi \n there\u0000 ")).toBe("hi there");
        expect(cleanCaption("x".repeat(500))).toHaveLength(MAX_CAPTION_LENGTH);
        expect(cleanCaption(undefined)).toBe("");
    });
});

describe("cloudinary urls", () => {
    const url = "https://res.cloudinary.com/demo/video/upload/v1/bovinetra/reels/a.mp4";

    it("builds a lighter stream and a poster", () => {
        expect(streamUrlFor(url)).toContain("/video/upload/q_auto,w_720,c_limit/");
        expect(posterUrlFor(url)).toMatch(/\.jpg$/);
    });

    it("leaves foreign urls alone", () => {
        expect(streamUrlFor("https://evil.example/x.mp4")).toBe("https://evil.example/x.mp4");
        expect(posterUrlFor("https://evil.example/x.mp4")).toBe("");
    });
});
