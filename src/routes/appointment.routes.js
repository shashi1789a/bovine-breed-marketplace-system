import { Router } from "express";

import { optionalAuth, verifyJWT, isDoctor } from "../middlewares/auth.middleware.js";
import {
    bookAppointment,
    cancelAppointment,
    completeAppointment,
    confirmAppointment,
    declineAppointment,
    listAppointments,
    listDoctors,
    saveAvailability,
    showAvailability,
    showBooking
} from "../controllers/appointment.controller.js";
import { userLimiter } from "../utils/limiter.js";

export const doctorsRouter = Router();
export const appointmentsRouter = Router();
export const availabilityRouter = Router();

const writeLimit = userLimiter({ windowMs: 10 * 60 * 1000, limit: 40, message: "Too many requests. Please wait a few minutes." });

doctorsRouter.get("/", optionalAuth, listDoctors);
doctorsRouter.get("/:id", optionalAuth, showBooking);

appointmentsRouter.use(verifyJWT);
appointmentsRouter.get("/", listAppointments);
appointmentsRouter.post("/", writeLimit, bookAppointment);
appointmentsRouter.post("/:id/confirm", writeLimit, confirmAppointment);
appointmentsRouter.post("/:id/decline", writeLimit, declineAppointment);
appointmentsRouter.post("/:id/cancel", writeLimit, cancelAppointment);
appointmentsRouter.post("/:id/complete", writeLimit, completeAppointment);

availabilityRouter.use(verifyJWT, isDoctor);
availabilityRouter.get("/", showAvailability);
availabilityRouter.post("/", writeLimit, saveAvailability);
