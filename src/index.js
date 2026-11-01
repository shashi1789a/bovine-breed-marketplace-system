import "dotenv/config";
import http from "node:http";
import cron from "node-cron";

import connectDB from "./db/index.js";
import { app } from "./app.js";
import { initSocket } from "./sockets/index.js";
import { releaseExpiredReservations } from "./controllers/order.controller.js";
import { captureError, flushMonitoring, initMonitoring } from "./utils/monitoring.js";
import { User } from "./models/user.model.js";
import { runDueReminders } from "./services/reminder.service.js";
import { runAppointmentReminders } from "./services/appointment.service.js";

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

const startReminderJobs = () => {
    cron.schedule(
        "0 8 * * *",
        async () => {
            try {
                const sent = await runDueReminders();

                if (sent > 0) console.log(`Sent ${sent} farm reminder(s)`);
            } catch (error) {
                console.error("Reminder job failed:", error);
            }
        },
        { timezone: "Asia/Kolkata" }
    );

    cron.schedule("*/5 * * * *", async () => {
        try {
            await runAppointmentReminders();
        } catch (error) {
            console.error("Appointment reminder job failed:", error);
        }
    });
};

process.on("unhandledRejection", (reason) => {
    console.error("Unhandled rejection:", reason);
    captureError(reason instanceof Error ? reason : new Error(String(reason)), { source: "unhandledRejection" });
});

process.on("uncaughtException", async (error) => {
    console.error("Uncaught exception:", error);
    captureError(error, { source: "uncaughtException" });
    await flushMonitoring();
    process.exit(1);
});

initMonitoring()
    .then(() => connectDB())
    .then(async () => {
        try {
            const moved = await User.collection.updateMany({ role: "buyer" }, { $set: { role: "seller" } });

            if (moved.modifiedCount > 0) console.log(`Changed ${moved.modifiedCount} buyer account(s) to seller`);
        } catch (error) {
            console.error("Role migration failed:", error.message);
        }

        const server = http.createServer(app);
        const io = initSocket(server);
        app.set("io", io);

        server.listen(PORT, () => {
            console.log(`Server is running at port : ${PORT}`);
        });

        startCleanupJob();
        startReminderJobs();

        const shutdown = (signal) => {
            console.log(`${signal} received, shutting down gracefully`);

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
