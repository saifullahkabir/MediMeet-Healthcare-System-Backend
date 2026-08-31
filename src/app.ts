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
import z from "zod";
import { sendResponse } from "./app/utils/sendResponse";

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

app.post("/zod", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const UserZodSchema = z.object({
      name: z.string().min(5),
      age: z.number().optional(),
      email: z.email(),
      isVerified: z.boolean().optional(),
      books: z.array(z.string()).optional(),
    });

    const payload = req.body;

    const result = UserZodSchema.parse(payload);

    console.log("result:",result);

    sendResponse(res, {
      statusCode: httpStatus.OK,
      success: true,
      message: "Zod",
      data: result,
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
