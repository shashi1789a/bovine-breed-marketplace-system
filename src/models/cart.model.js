import mongoose, { Schema } from "mongoose";

export const MAX_CART_ITEMS = 50;
export const MAX_QUANTITY_PER_ITEM = 100;

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

const cartItemSchema = new Schema(
    {
        product: {
            type: Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },

        seller: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        sellerRole: {
            type: String,
            enum: ["farmer", "doctor", "admin"],
            required: true
        },

        quantity: {
            type: Number,
            default: 1,
            min: [1, "Quantity must be at least 1"],
            max: [MAX_QUANTITY_PER_ITEM, `Quantity cannot exceed ${MAX_QUANTITY_PER_ITEM}`],
            validate: {
                validator: Number.isInteger,
                message: "Quantity must be a whole number"
            }
        },

        price: {
            type: Number,
            required: true,
            min: 0
        },

        totalPrice: {
            type: Number,
            required: true,
            min: 0
        }
    },
    { _id: false }
);

const cartSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true
        },

        items: {
            type: [cartItemSchema],
            default: [],
            validate: {
                validator: (value) => value.length <= MAX_CART_ITEMS,
                message: `A cart can hold at most ${MAX_CART_ITEMS} different products`
            }
        },

        totalItems: {
            type: Number,
            default: 0
        },

        totalQuantity: {
            type: Number,
            default: 0
        },

        totalAmount: {
            type: Number,
            default: 0
        }
    },
    { timestamps: true }
);

cartSchema.methods.calculateCart = function () {
    for (const item of this.items) {
        item.totalPrice = round2(item.price * item.quantity);
    }

    this.totalItems = this.items.length;

    this.totalQuantity = this.items.reduce((sum, item) => sum + item.quantity, 0);

    this.totalAmount = round2(
        this.items.reduce((sum, item) => sum + item.totalPrice, 0)
    );
};

export const Cart = mongoose.model("Cart", cartSchema);