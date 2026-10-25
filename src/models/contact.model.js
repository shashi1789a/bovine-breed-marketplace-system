import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            maxlength: 254
        },
        phone: {
            type: String,
            trim: true,
            maxlength: 20,
            default: ""
        },
        subject: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        },
        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 5000
        },
        businessType: {
    type: String,
    trim: true,
    maxlength: 100,
    default: ""
},
        status: {
            type: String,
            enum: ["new", "read", "replied"],
            default: "new"
        }
    },
    {
        timestamps: true
    }
);

const Contact = mongoose.model("Contact", contactSchema);

export default Contact;