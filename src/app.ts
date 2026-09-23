import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Application,
  type Request,
  type Response,
} from "express";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { sendResponse } from "./app/utils/sendResponse";
import { UserRoutes } from "./app/module/user/user.route";
import { getBkashIdToken } from "./app/lib/bkash";
import { AppointmentRoutes } from "./app/module/appointment/appointment.route";

const app: Application = express();

app.use(
  cors({
    origin: config.frontend_url,
    credentials: true,
  }),
);

// Enable URL-encoded form data parsing
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON bodies
app.use(express.json());
app.use(cookieParser());

app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/user", UserRoutes);
app.use("/api/v1/appointment", AppointmentRoutes);

app.get("/test", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const grantIdTokenResult = await getBkashIdToken();

    console.log("result by app.ts test route=>", grantIdTokenResult);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "redis tested",
      data: grantIdTokenResult,
    });
  } catch (error) {
    console.log(error);
    next(error);
  }
});

// Basic route
app.get("/", async (req: Request, res: Response) => {
  res.status(httpStatus.OK).json({
    success: true,
    message: "Welcome to MediMeet Healthcare System Backend",
  });
});

app.use(globalErrorHandler);
app.use(notFound);

export default app;
