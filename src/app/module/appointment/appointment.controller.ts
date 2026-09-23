import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { AppointmentService } from "./appointment.service";

const bookAppointment = catchAsync(async (req: Request, res: Response) => {
  const result = await AppointmentService.bookAppointment();

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Appointment booking successfully",
    data: result,
  });
});

const bookAppointmentCallback = catchAsync(
  async (req: Request, res: Response) => {
    console.log("query", req.query);

    const result = await AppointmentService.bookAppointmentCallback(req.query);

    sendResponse(res, {
      statusCode: httpStatus.CREATED,
      success: true,
      message: "Appointment booking successfully",
      data: result,
    });
  },
);

export const AppointmentController = {
  bookAppointment,
  bookAppointmentCallback,
};
