import "dotenv/config";
import http from "node:http";
import cron from "node-cron";

import connectDB from "./db/index.js";
import { app } from "./app.js";
import { initSocket } from "./sockets/index.js";
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
        const server = http.createServer(app);
        const io = initSocket(server);

        server.listen(PORT, () => {
            console.log(`Server is running at port : ${PORT}`);
        });

        startCleanupJob();

        const shutdown = (signal) => {
            console.log(`${signal} received, shutting down gracefully`);

            /* io.close() also closes the underlying HTTP server. */
            io.close(() => {
                console.log("HTTP and socket servers closed");
                process.exit(0);
            });

            setTimeout(() => process.exit(1), 10000).unref();
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
    })
    .catch((err) => {
        console.log("MONGO db connection failed !!!", err);
        process.exit(1);
    });
