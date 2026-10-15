import { v2 as cloudinary } from "cloudinary";
import { promises as fs } from "fs";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const uploadOnCloudinary = async (localFilePath, options = {}) => {
    if (!localFilePath) return null;

    try {
        return await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
            ...options
        });
    } catch (error) {
        console.error("[cloudinary] upload failed:", error.message);
        return null;
    } finally {
        await fs.unlink(localFilePath).catch(() => {});
    }
};

export { uploadOnCloudinary };