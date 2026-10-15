import "dotenv/config";
import mongoose from "mongoose";

import { DB_NAME } from "../src/constants.js";
import { User, EMAIL_PATTERN } from "../src/models/user.model.js";

const USERNAME_PATTERN = /^[a-z0-9_.]{3,30}$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const DEFAULT_AVATAR = "/images/default-avatar.png";

const USAGE =
    'Usage: npm run create-admin -- --email you@example.com --username admin --password "Admin1234" --name "Your Name"';

const readArgs = () => {
    const args = process.argv.slice(2);
    const values = {};

    for (let index = 0; index < args.length; index++) {
        if (!args[index].startsWith("--")) continue;

        const next = args[index + 1];
        const hasValue = next !== undefined && !next.startsWith("--");

        values[args[index].slice(2)] = hasValue ? next : "";

        if (hasValue) index++;
    }

    return values;
};

const fail = (message) => {
    console.error(`\n${message}\n\n${USAGE}\n`);
    process.exit(1);
};

const main = async () => {
    const args = readArgs();

    const email = String(args.email || process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const username = String(args.username || process.env.ADMIN_USERNAME || "").trim().toLowerCase();
    const fullName = String(args.name || process.env.ADMIN_NAME || "Administrator").trim();
    const password = String(args.password || process.env.ADMIN_PASSWORD || "");
    const avatar = String(args.avatar || process.env.ADMIN_AVATAR || DEFAULT_AVATAR);

    if (!process.env.MONGODB_URI) {
        fail("MONGODB_URI is not set. Add it to your .env file.");
    }

    if (!EMAIL_PATTERN.test(email)) {
        fail("Enter a valid email with --email.");
    }

    if (!USERNAME_PATTERN.test(username)) {
        fail("Username must be 3-30 characters: lowercase letters, numbers, dot or underscore.");
    }

    if (fullName.length < 2 || fullName.length > 100) {
        fail("Name must be 2-100 characters.");
    }

    if (
        password.length < PASSWORD_MIN ||
        password.length > PASSWORD_MAX ||
        !/[A-Za-z]/.test(password) ||
        !/\d/.test(password)
    ) {
        fail(`Password must be ${PASSWORD_MIN}-${PASSWORD_MAX} characters with at least one letter and one number.`);
    }

    await mongoose.connect(process.env.MONGODB_URI, { dbName: DB_NAME });

    const existing = await User.findOne({ $or: [{ email }, { username }] });

    if (existing) {
        existing.role = "admin";
        existing.isActive = true;
        await existing.save();

        console.log(`\n${existing.email} is now an admin. Its password was not changed.\n`);
        return;
    }

    await User.create({ fullName, email, username, password, avatar, role: "admin" });

    console.log(`\nAdmin account created: ${email}\nSign in at /login.\n`);
};

main()
    .catch((error) => {
        console.error(`\nCould not create the admin: ${error.message}\n`);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());