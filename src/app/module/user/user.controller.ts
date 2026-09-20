import httpStatus from "http-status";
import type { Request, Response } from "express";
import { catchAsync } from "../../utils/catchAsync";
import { sendResponse } from "../../utils/sendResponse";
import { UserService } from "./user.service";

const uploadProfileImage = catchAsync(async (req: Request, res: Response) => {
  console.log("req file =====>", req.file);

  if (!req.file) {
    throw new Error("File not provided");
  }

  const userId = req.user?.userId as string;

  const result = await UserService.uploadProfileImage(req.file?.buffer, userId);

  sendResponse(res, {
    statusCode: httpStatus.CREATED,
    success: true,
    message: "Profile image uploaded successfully",
    data: result,
  });
});

export const UserController = {
  uploadProfileImage,
};
