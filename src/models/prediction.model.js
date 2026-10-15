import mongoose, { Schema } from "mongoose";

const predictionSchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", default: null },
        breed: { type: String, required: true, trim: true },
        confidence: { type: Number, required: true, min: 0, max: 100 },
        info: {
            origin: { type: String, default: "" },
            milk_yield: { type: String, default: "" },
            features: { type: String, default: "" },
            use: { type: String, default: "" },
            type: { type: String, default: "" },
            disease_resistance: { type: String, default: "" },
            heat_tolerance: { type: String, default: "" }
        },
        imageUrl: { type: String, default: "", trim: true },
        source: { type: String, enum: ["upload", "camera"], default: "upload" }
    },
    { timestamps: true }
);

predictionSchema.index({ user: 1, createdAt: -1 });

export const Prediction = mongoose.model("Prediction", predictionSchema);