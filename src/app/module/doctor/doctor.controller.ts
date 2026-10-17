import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from "./doctor.service";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const resume = files?.["resume"] ? files["resume"][0] : null;

  const additionalFiles = files?.["additionalFiles"] || [];

  const data = JSON.parse(req.body.data);

  console.log({ resume, additionalFiles, data });

  // const result = await DoctorService.applyAsDoctor();
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Applied as doctor successfully",
    // data: result,
  });
});

export const DoctorController = {
  applyAsDoctor,
};
