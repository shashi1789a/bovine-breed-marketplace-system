import { Appointment, ACTIVE_STATUSES } from "../models/appointment.model.js";
import { User } from "../models/user.model.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { isObjectId, queryString, readFlash, reject, respond } from "../utils/http.js";
import { formatSlot } from "../utils/ist.js";
import { notify } from "../services/notification.service.js";
import { BOOKING_DAYS, canJoin, doctorSettings, openSlots } from "../services/appointment.service.js";

const HOME = "/appointments";
const MAX_OPEN_PER_PATIENT = 5;
const DUPLICATE_KEY = 11000;

const PUBLIC_DOCTOR_FIELDS = "fullName username avatar role isActive doctorDetails";

const findDoctor = async (id) => {
    if (!isObjectId(id)) return null;

    const doctor = await User.findOne({ _id: id, role: "doctor", isActive: { $ne: false } }).select(PUBLIC_DOCTOR_FIELDS).lean();

    return doctor || null;
};

export const listDoctors = asyncHandler(async (req, res) => {
    const q = queryString(req.query.q, 60);
    const filter = { role: "doctor", isActive: { $ne: false }, "doctorDetails.acceptingBookings": true };

    if (q) {
        const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        filter.$or = [{ fullName: pattern }, { "doctorDetails.specialization": pattern }];
    }

    const doctors = await User.find(filter).select(PUBLIC_DOCTOR_FIELDS).sort({ fullName: 1 }).limit(60).lean();

    return res.status(200).render("appointments/doctors", {
        title: "Book a Doctor | BoviNetra",
        user: req.user,
        doctors,
        q
    });
});

export const showBooking = asyncHandler(async (req, res) => {
    const doctor = await findDoctor(req.params.id);

    if (!doctor) return res.status(404).render("404", { title: "Doctor not found", user: req.user });

    const slots = await openSlots(doctor);

    return res.status(200).render("appointments/book", {
        title: `Book ${doctor.fullName} | BoviNetra`,
        user: req.user,
        doctor,
        settings: doctorSettings(doctor),
        slots,
        days: BOOKING_DAYS,
        isSelf: req.user ? String(req.user._id) === String(doctor._id) : false,
        isDoctorViewer: req.user?.role === "doctor",
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

export const bookAppointment = asyncHandler(async (req, res) => {
    const doctorId = String(req.body?.doctorId || "");
    const back = isObjectId(doctorId) ? `/doctors/${doctorId}` : "/doctors";

    if (req.user.role === "doctor") {
        return reject(req, res, { status: 403, message: "Doctors cannot book consultations", redirectTo: back });
    }

    const doctor = await findDoctor(doctorId);

    if (!doctor) return reject(req, res, { status: 404, message: "Doctor not found", redirectTo: "/doctors" });

    const reason = queryString(req.body?.reason, 400);

    if (reason.length < 5) return reject(req, res, { message: "Tell the doctor briefly what the problem is", redirectTo: back });

    const requested = new Date(String(req.body?.slot || ""));

    if (Number.isNaN(requested.getTime())) return reject(req, res, { message: "Choose a time slot", redirectTo: back });

    const slots = await openSlots(doctor);
    const valid = slots.some((day) => day.times.some((time) => new Date(time.iso).getTime() === requested.getTime()));

    if (!valid) return reject(req, res, { status: 409, message: "That time is no longer available. Please pick another.", redirectTo: back });

    const open = await Appointment.countDocuments({ patient: req.user._id, status: { $in: ACTIVE_STATUSES }, startsAt: { $gte: new Date() } });

    if (open >= MAX_OPEN_PER_PATIENT) {
        return reject(req, res, { message: "You already have several upcoming bookings. Cancel one first.", redirectTo: HOME });
    }

    const settings = doctorSettings(doctor);

    try {
        await Appointment.create({
            patient: req.user._id,
            doctor: doctor._id,
            startsAt: requested,
            durationMin: settings.slotMinutes,
            reason,
            cattleLabel: queryString(req.body?.cattleLabel, 80),
            fee: settings.fee
        });
    } catch (error) {
        if (error?.code === DUPLICATE_KEY) {
            return reject(req, res, { status: 409, message: "Someone just booked that time. Please pick another.", redirectTo: back });
        }

        throw error;
    }

    await notify(doctor._id, {
        type: "appointment",
        title: `New consultation request: ${formatSlot(requested)}`,
        body: `${req.user.fullName}: ${reason}`,
        link: HOME
    });

    return respond(req, res, { status: 201, redirectTo: HOME, message: "Booking requested. The doctor will confirm soon." });
});

export const listAppointments = asyncHandler(async (req, res) => {
    const isDoctor = req.user.role === "doctor";
    const tab = req.query.tab === "past" ? "past" : "upcoming";
    const now = new Date();
    const mine = isDoctor ? { doctor: req.user._id } : { patient: req.user._id };
    const cutoff = new Date(now.getTime() - 60 * 60 * 1000);

    const filter =
        tab === "upcoming"
            ? { ...mine, status: { $in: ACTIVE_STATUSES }, startsAt: { $gte: cutoff } }
            : { ...mine, $or: [{ status: { $in: ["declined", "cancelled", "completed"] } }, { startsAt: { $lt: cutoff } }] };

    const appointments = await Appointment.find(filter)
        .populate(isDoctor ? "patient" : "doctor", "fullName username avatar")
        .sort(tab === "upcoming" ? { startsAt: 1 } : { startsAt: -1 })
        .limit(100)
        .lean();

    const items = appointments.map((item) => {
        const other = isDoctor ? item.patient : item.doctor;
        const started = item.startsAt.getTime() <= now.getTime();

        return {
            ...item,
            other,
            canJoin: canJoin(item, now.getTime()),
            canComplete: isDoctor && item.status === "confirmed" && started,
            canCancel: ["pending", "confirmed"].includes(item.status) && !started
        };
    });

    return res.status(200).render("appointments/index", {
        title: "Appointments | BoviNetra",
        user: req.user,
        isDoctor,
        tab,
        items,
        formatSlot,
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const loadMine = async (req, res) => {
    if (!isObjectId(req.params.id)) {
        reject(req, res, { status: 404, message: "Appointment not found", redirectTo: HOME });
        return null;
    }

    const appointment = await Appointment.findById(req.params.id);
    const me = String(req.user._id);

    if (!appointment || (String(appointment.doctor) !== me && String(appointment.patient) !== me)) {
        reject(req, res, { status: 404, message: "Appointment not found", redirectTo: HOME });
        return null;
    }

    return appointment;
};

const tellOther = (appointment, actor, title) =>
    notify(String(appointment.doctor) === String(actor._id) ? appointment.patient : appointment.doctor, {
        type: "appointment",
        title,
        body: `${actor.fullName} · ${formatSlot(appointment.startsAt)}`,
        link: HOME
    });

export const confirmAppointment = asyncHandler(async (req, res) => {
    const appointment = await loadMine(req, res);
    if (!appointment) return null;

    if (String(appointment.doctor) !== String(req.user._id) || appointment.status !== "pending" || appointment.startsAt <= new Date()) {
        return reject(req, res, { status: 409, message: "This request cannot be confirmed", redirectTo: HOME });
    }

    appointment.status = "confirmed";
    appointment.doctorNote = queryString(req.body?.note, 600) || appointment.doctorNote;
    await appointment.save();
    await tellOther(appointment, req.user, "Your consultation is confirmed");

    return respond(req, res, { redirectTo: HOME, message: "Appointment confirmed" });
});

export const declineAppointment = asyncHandler(async (req, res) => {
    const appointment = await loadMine(req, res);
    if (!appointment) return null;

    if (String(appointment.doctor) !== String(req.user._id) || appointment.status !== "pending") {
        return reject(req, res, { status: 409, message: "This request cannot be declined", redirectTo: HOME });
    }

    appointment.status = "declined";
    appointment.doctorNote = queryString(req.body?.note, 600);
    await appointment.save();
    await tellOther(appointment, req.user, "Your consultation request was declined");

    return respond(req, res, { redirectTo: HOME, message: "Request declined" });
});

export const cancelAppointment = asyncHandler(async (req, res) => {
    const appointment = await loadMine(req, res);
    if (!appointment) return null;

    if (!ACTIVE_STATUSES.includes(appointment.status) || appointment.startsAt <= new Date()) {
        return reject(req, res, { status: 409, message: "This appointment cannot be cancelled", redirectTo: HOME });
    }

    appointment.status = "cancelled";
    await appointment.save();
    await tellOther(appointment, req.user, "A consultation was cancelled");

    return respond(req, res, { redirectTo: HOME, message: "Appointment cancelled" });
});

export const completeAppointment = asyncHandler(async (req, res) => {
    const appointment = await loadMine(req, res);
    if (!appointment) return null;

    if (String(appointment.doctor) !== String(req.user._id) || appointment.status !== "confirmed" || appointment.startsAt > new Date()) {
        return reject(req, res, { status: 409, message: "This consultation cannot be completed yet", redirectTo: HOME });
    }

    appointment.status = "completed";
    appointment.doctorNote = queryString(req.body?.note, 600) || appointment.doctorNote;
    await appointment.save();
    await tellOther(appointment, req.user, "Consultation completed. Doctor's notes are ready");

    return respond(req, res, { redirectTo: HOME, message: "Marked as completed" });
});

export const showAvailability = asyncHandler(async (req, res) => {
    const me = await User.findById(req.user._id).select("doctorDetails").lean();

    return res.status(200).render("appointments/availability", {
        title: "My Availability | BoviNetra",
        user: req.user,
        settings: doctorSettings(me),
        specialization: me?.doctorDetails?.specialization || "",
        success: readFlash(req.query.success),
        error: readFlash(req.query.error)
    });
});

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

export const saveAvailability = asyncHandler(async (req, res) => {
    const back = "/doctor/availability";
    const from = String(req.body?.availableFrom || "");
    const to = String(req.body?.availableTo || "");
    const slotMinutes = Number.parseInt(req.body?.slotMinutes, 10);
    const fee = Number(req.body?.consultationFee || 0);

    const rawDays = [].concat(req.body?.workDays || []);
    const workDays = [...new Set(rawDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))];

    if (!CLOCK.test(from) || !CLOCK.test(to) || from >= to) {
        return reject(req, res, { message: "Choose valid working hours (start before end)", redirectTo: back });
    }

    if (!Number.isInteger(slotMinutes) || slotMinutes < 10 || slotMinutes > 60) {
        return reject(req, res, { message: "Slot length must be between 10 and 60 minutes", redirectTo: back });
    }

    if (!Number.isFinite(fee) || fee < 0 || fee > 100000) {
        return reject(req, res, { message: "Enter a valid fee", redirectTo: back });
    }

    const accepting = req.body?.acceptingBookings === "on" || req.body?.acceptingBookings === "true";

    if (accepting && !workDays.length) {
        return reject(req, res, { message: "Pick at least one working day", redirectTo: back });
    }

    await User.updateOne(
        { _id: req.user._id },
        {
            $set: {
                "doctorDetails.availableFrom": from,
                "doctorDetails.availableTo": to,
                "doctorDetails.slotMinutes": slotMinutes,
                "doctorDetails.consultationFee": Math.round(fee),
                "doctorDetails.workDays": workDays,
                "doctorDetails.acceptingBookings": accepting,
                "doctorDetails.specialization": queryString(req.body?.specialization, 150)
            }
        }
    );

    return respond(req, res, { redirectTo: back, message: "Availability saved" });
});


