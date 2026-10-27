import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { DoctorService } from "./doctor.service";
import { applyAsDoctorValidationSchema } from "./doctor.validation";

const applyAsDoctor = catchAsync(async (req: Request, res: Response) => {
  const files = req.files as { [fieldname: string]: Express.Multer.File[] };

  const resume = files?.["resume"] ? files["resume"][0] : null;
  const additionalFiles = files?.["additionalFiles"] || [];
  const data = JSON.parse(req.body.data);

  // zod validation
  const zodValidationResult = applyAsDoctorValidationSchema.safeParse(data);

  if (!zodValidationResult.success) {
    throw new Error(zodValidationResult.error.issues[0].message);
  }

  const payload = zodValidationResult.data;

  const result = await DoctorService.applyAsDoctor(
    payload,
    resume,
    additionalFiles,
  );
  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Applied as doctor successfully",
    data: result,
  });
});

const verifyDoctorEmail = catchAsync(async (req: Request, res: Response) => {
  const result = await DoctorService.verifyDoctorEmail(req.body);

  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: "Doctor email verified successfully",
    data: result,
  });
});

export const DoctorController = {
  applyAsDoctor,
  verifyDoctorEmail,
};
