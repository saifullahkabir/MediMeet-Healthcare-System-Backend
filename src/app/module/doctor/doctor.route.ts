import { Router } from "express";
import { DoctorController } from "./doctor.controller";
import { upload } from "../../lib/multer";

const router = Router();

router.post(
  "/apply-as-doctor",
  upload.fields([
    { name: "resume", maxCount: 1 },
    { name: "additionalFiles", maxCount: 10 },
  ]),
  DoctorController.applyAsDoctor,
);

router.post(
  "/apply-as-doctor/verify-email",
  DoctorController.verifyDoctorEmail,
);

export const DoctorRoutes = router;
