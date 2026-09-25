import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const payload = req.body;
  const user = req.user!;

  const result = await AppointmentService.bookAppointment(payload, user);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Appointment booking successfully",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    const { executedPaymentResult, redirectUrl } =
      await AppointmentService.bookAppointmentCallback(req.query);

    res.redirect(redirectUrl);

    // sendResponse(res, {
    //   statusCode: httpStatus.CREATED,
    //   success: true,
    //   message: "Appointment booking successfully",
    //   data: executedPaymentResult,
    // });
  },
);

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
};
