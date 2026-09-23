import dotenv from "dotenv";

dotenv.config({ path: "./.env" });

import cron from "node-cron";

import connectDB from "./db/index.js";
import { app } from "./app.js";
import { releaseExpiredReservations } from "./controllers/order.controller.js";

const PORT = process.env.PORT || 8000;

const startCleanupJob = () => {
    cron.schedule("*/5 * * * *", async () => {
        try {
            const released = await releaseExpiredReservations();

            if (released > 0) {
                console.log(`Released stock for ${released} expired order(s)`);
            }
        } catch (error) {
            console.error("Order cleanup job failed:", error);
        }
    });
};

connectDB()
    .then(() => {
        const server = app.listen(PORT, () => {
            console.log(`Server is running at port : ${PORT}`);
        });

        startCleanupJob();

        const shutdown = (signal) => {
            console.log(`${signal} received, shutting down gracefully`);

            server.close(() => {
                console.log("HTTP server closed");
                process.exit(0);
            });
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
    })
    .catch((err) => {
        console.log("MONGO db connection failed !!!", err);
        process.exit(1);
    });