import mongoose, { Schema } from "mongoose";

export const DAIRY_KINDS = Object.freeze(["milk", "expense", "income"]);
export const EXPENSE_CATEGORIES = Object.freeze(["feed", "medicine", "labour", "equipment", "electricity", "transport", "other"]);
export const INCOME_CATEGORIES = Object.freeze(["cattle_sale", "manure", "subsidy", "other"]);

const dairyEntrySchema = new Schema(
    {
        user: { type: Schema.Types.ObjectId, ref: "User", required: true },
        kind: { type: String, enum: DAIRY_KINDS, required: true },
        day: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
        morningLitres: { type: Number, min: 0, max: 1000, default: 0 },
        eveningLitres: { type: Number, min: 0, max: 1000, default: 0 },
        ratePerLitre: { type: Number, min: 0, max: 1000, default: 0 },
        amount: { type: Number, min: 0, max: 100000000, default: 0 },
        category: { type: String, trim: true, maxlength: 30, default: "" },
        note: { type: String, trim: true, maxlength: 150, default: "" }
    },
    { timestamps: true }
);

dairyEntrySchema.index({ user: 1, day: 1 });
dairyEntrySchema.index(
    { user: 1, day: 1 },
    { unique: true, partialFilterExpression: { kind: "milk" }, name: "one_milk_record_per_day" }
);

export const DairyEntry = mongoose.models.DairyEntry || mongoose.model("DairyEntry", dairyEntrySchema);
