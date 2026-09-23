import { promises as fs } from "fs";

const collectPaths = (req) =>
    [
        ...(req.file ? [req.file] : []),
        ...Object.values(req.files || {}).flat()
    ]
        .map((file) => file?.path)
        .filter(Boolean);

export const discardUploads = async (req) => {
    await Promise.all(
        collectPaths(req).map((path) => fs.unlink(path).catch(() => {}))
    );
};