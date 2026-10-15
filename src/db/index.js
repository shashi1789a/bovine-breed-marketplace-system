import mongoose from "mongoose";

import { DB_NAME } from "../constants.js";

const supportsTransactions = async () => {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });

    return Boolean(info.setName) || info.msg === "isdbgrid";
};

const warnIfStandalone = async () => {
    try {
        if (await supportsTransactions()) return;
    } catch (error) {
        return;
    }

    console.warn(
        "\n[db] This MongoDB server is a standalone instance. Checkout, order cancellation and refunds use transactions and will fail.\n" +
            "[db] Use MongoDB Atlas, or run a local replica set and add ?replicaSet=rs0 to MONGODB_URI.\n"
    );
};

const connectDB = async () => {
    try {
        const connectionInstance = await mongoose.connect(process.env.MONGODB_URI, {
            dbName: DB_NAME
        });

        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);

        await warnIfStandalone();
    } catch (error) {
        console.log("MONGODB connection FAILED ", error);
        process.exit(1);
    }
};

export default connectDB;