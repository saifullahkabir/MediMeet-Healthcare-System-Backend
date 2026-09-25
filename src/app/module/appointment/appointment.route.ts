import { Router } from "express";
import { AppointmentController } from "./appointment.controller";
import { auth } from "../../middleware/checkAuth";
import { Role } from "../../../generated/prisma/enums";

const router = Router();

router.post(
  "/book-appointment",
  auth(Role.PATIENT),
  AppointmentController.bookAppointment,
);

// book appointment callback url
router.get(
  "/book-appointment/payment/callback",
  AppointmentController.bookAppointmentCallback,
);

export const AppointmentRoutes = router;
