import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";

import { User } from "../../../src/models/user.model.js";

let counter = 0;

/* Starts a throw-away MongoDB in memory and sets the env vars the app reads. */
export const startTestDb = async () => {
    process.env.NODE_ENV = "test";
    process.env.ACCESS_TOKEN_SECRET ||= "test-access-secret";
    process.env.REFRESH_TOKEN_SECRET ||= "test-refresh-secret";
    process.env.ACCESS_TOKEN_EXPIRY ||= "1h";
    process.env.REFRESH_TOKEN_EXPIRY ||= "7d";

    const mongod = await MongoMemoryServer.create();

    await mongoose.connect(mongod.getUri(), { dbName: "chat_test" });
    await Promise.all(Object.values(mongoose.models).map((model) => model.init()));

    return mongod;
};

export const stopTestDb = async (mongod) => {
    await mongoose.disconnect();
    await mongod.stop();
};

/* A real user in the database plus a ready-to-use auth cookie. */
export const createUser = async (role = "user", overrides = {}) => {
    const n = ++counter;

    const user = await User.create({
        username: `${role}_${n}`,
        email: `${role}${n}@example.com`,
        fullName: `Test ${role} ${n}`,
        avatar: "https://example.com/avatar.png",
        password: "Passw0rd!x",
        role,
        ...overrides
    });

    return {
        user,
        id: String(user._id),
        cookie: `accessToken=${user.generateAccessToken()}`
    };
};

export const ROLES = ["user", "farmer", "doctor", "buyer", "admin"];
