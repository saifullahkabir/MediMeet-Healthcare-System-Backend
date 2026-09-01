import type z from "zod";
import { catchAsync } from "../utils/catchAsync";
import type { Request, Response, NextFunction } from "express";

export const validateRequest = (zodSchema: z.ZodObject) => {
  return catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    const payload = req.body ?? {};

    const result = zodSchema.safeParse(payload);

    if (!result.success) {
      throw new Error(result.error.issues[0].message);
    }

    req.body = result.data;

    next();
  });
};
