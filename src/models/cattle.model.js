import mongoose, { Schema } from "mongoose";

export const CATTLE_CATEGORIES = Object.freeze(["Cow", "Buffalo"]);
export const CATTLE_MANAGER_ROLES = Object.freeze(["farmer"]);
export const MAX_CATTLE_IMAGES = 6;

const text = (max = 200) => ({
    type: String,
    trim: true,
    maxlength: [max, `{PATH} cannot exceed ${max} characters`]
});

const choice = (values) => ({
    type: String,
    enum: { values, message: "{VALUE} is not a valid {PATH}" }
});

const amount = (max) => ({
    type: Number,
    min: [0, "{PATH} cannot be negative"],
    ...(max !== undefined && { max: [max, `{PATH} cannot exceed ${max}`] })
});

const cattleSchema = new Schema(
    {
        breedName: {
            type: String,
            required: [true, "Breed name is required"],
            trim: true,
            minlength: [2, "Breed name must be at least 2 characters"],
            maxlength: [120, "Breed name cannot exceed 120 characters"]
        },

        name: text(100),

        imageUrl: text(500),

        images: {
            type: [String],
            default: [],
            validate: {
                validator: (value) => value.length <= MAX_CATTLE_IMAGES,
                message: `Cattle can have at most ${MAX_CATTLE_IMAGES} images`
            }
        },

        scientificName: text(150),

        category: {
            type: String,
            required: [true, "Category is required"],
            enum: {
                values: CATTLE_CATEGORIES,
                message: "{VALUE} is not a valid category"
            }
        },

        originCountry: text(100),
        originState: text(100),

        breedType: choice(["Milch", "Dual-purpose", "Draught"]),
        color: choice(["Red", "Brown", "Black", "White", "Grey", "Fawn", "Mixed"]),
        bodySize: choice(["Small", "Medium", "Large"]),
        gender: choice(["Male", "Female"]),

        age: amount(600),
        weight: amount(2000),
        price: amount(),
        healthStatus: text(100),
        description: text(2000),

        avgWeightMale: amount(2000),
        avgWeightFemale: amount(2000),
        heightCm: amount(250),
        hornShape: text(100),
        earType: text(100),
        tailLength: text(100),
        skinType: choice(["Loose", "Tight"]),
        uniqueFeatures: text(1000),

        avgMilkPerDay: amount(100),
        peakLactationYield: amount(150),
        lactationPeriod: amount(1000),
        fatPercentage: amount(100),
        snf: amount(100),
        milkQualityGrade: text(50),
        lifetimeMilkProduction: amount(),

        suitableClimate: choice(["Hot", "Cold", "Humid"]),
        heatToleranceLevel: text(100),
        droughtResistance: text(100),
        humidityTolerance: text(100),
        diseaseResistance: text(200),
        regionSuitabilityMap: text(500),

        dailyFeedRequirement: text(300),
        greenFodderQty: amount(),
        dryFodderQty: amount(),
        concentrateFeed: text(200),
        waterIntake: amount(),
        specialDietLactation: text(500),
        mineralRequirement: text(500),

        ageFirstCalving: amount(),
        calvingInterval: amount(),
        gestationPeriod: amount(),
        fertilityRate: text(100),
        heatCycleDuration: amount(),
        bestBreedingSeason: text(100),
        artificialInsemination: { type: Boolean },

        commonDiseases: text(1000),
        diseaseResistanceLevel: text(100),
        vaccinationSchedule: text(1000),
        parasiteSusceptibility: text(500),
        preventiveCareTips: text(1000),

        lifespan: amount(),
        avgMarketPrice: amount(),
        priceByAge: text(500),
        priceByMilkProduction: text(500),
        demandLevel: choice(["High", "Medium", "Low"]),
        ROI: { type: Number },
        maintenanceCost: amount(),

        milkEfficiencyScore: amount(),
        feedConversionRatio: amount(),
        growthRate: amount(),
        reproductionEfficiency: amount(),
        overallProductivityScore: amount(),

        statePopularity: text(500),
        availabilityZones: text(500),
        bestRegionsForFarming: text(500),
        migrationAdaptability: text(200),

        registeredBreedStatus: { type: Boolean },
        governmentSchemes: text(1000),
        NABARDSubsidyInfo: text(1000),
        breedCertification: text(200),

        farmer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        buyer: {
            type: Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        sold: {
            type: Boolean,
            default: false
        },

        soldAt: Date,

        isActive: {
            type: Boolean,
            default: true
        },

        isDeleted: {
            type: Boolean,
            default: false
        },

        deletedAt: Date
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret) => {
                delete ret.__v;
                return ret;
            }
        }
    }
);

cattleSchema.pre("validate", async function () {
    if (!this.isModified("sold")) return;

    if (this.sold) {
        this.soldAt = this.soldAt || new Date();
    } else {
        this.soldAt = undefined;
        this.buyer = null;
    }
});

cattleSchema.pre(
    [
        "find",
        "findOne",
        "findOneAndUpdate",
        "findOneAndDelete",
        "countDocuments",
        "updateOne",
        "updateMany"
    ],
    function () {
        if (this.getOptions().includeDeleted) return;
        this.where({ isDeleted: { $ne: true } });
    }
);

cattleSchema.pre("aggregate", function () {
    if (this.options?.includeDeleted) return;
    this.pipeline().unshift({ $match: { isDeleted: { $ne: true } } });
});

cattleSchema.index({ farmer: 1, createdAt: -1 });
cattleSchema.index({ buyer: 1, createdAt: -1 }, { sparse: true });
cattleSchema.index({ isActive: 1, sold: 1, category: 1, createdAt: -1 });
cattleSchema.index({ isActive: 1, sold: 1, price: 1 });
cattleSchema.index({ breedName: 1 });

export const Cattle = mongoose.model("Cattle", cattleSchema);