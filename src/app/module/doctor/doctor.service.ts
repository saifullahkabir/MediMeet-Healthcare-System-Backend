import type { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import type {
  ApplyAsDoctorPayload,
  ApproveDoctorPayload,
  VerifyDoctorEmailPayload,
} from "./doctor.interface";
import { cloudinary } from "../../lib/cloudinary";
import {
  DoctorVerificationStatus,
  Role,
} from "../../../generated/prisma/enums";
import bcrypt from "bcryptjs";
import config from "../../config";
import crypto from "node:crypto";
import { redisClient } from "../../lib/redis";
import path from "node:path";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import type { RequestUser } from "../../middleware/checkAuth";

const applyAsDoctor = async (
  payload: ApplyAsDoctorPayload,
  resume: Express.Multer.File | null,
  additionalFiles: Express.Multer.File[],
) => {
  // 1. Check existing user
  const isUserExists = await prisma.user.findUnique({
    where: {
      email: payload.user.email,
    },
  });

  if (isUserExists) {
    throw new Error("User already exists with this email");
  }

  // 2. Check existing doctor by license number
  const isLicenseExists = await prisma.doctor.findUnique({
    where: {
      licenseNumber: payload.doctor.licenseNumber,
    },
  });

  if (isLicenseExists) {
    throw new Error("This license number is already registered");
  }

  // 3. Upload resume
  const resumeUploadResult = await new Promise<UploadApiResponse>(
    (resolve, reject) => {
      cloudinary.uploader
        .upload_stream(
          {
            resource_type: "auto",
          },

          async (error, result) => {
            if (error) {
              return reject(error);
            }

            if (!result) {
              return reject(new Error("No result returned from Cloudinary"));
            }

            resolve(result);
          },
        )
        .end(resume?.buffer);
    },
  );

  // 4. Upload additional files
  const additionalFilesUploadResults = await Promise.all(
    additionalFiles.map((file) => {
      return new Promise<UploadApiResponse>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              resource_type: "auto",
            },

            async (error, result) => {
              if (error) {
                return reject(error);
              }
              if (!result) {
                return reject(new Error("No result returned from Cloudinary"));
              }

              resolve(result);
            },
          )
          .end(file?.buffer);
      });
    }),
  );

  // 5. password generator
  const randomDoctorPassword = Math.random().toString(36).slice(-8);

  const hashedPassword = await bcrypt.hash(
    randomDoctorPassword,
    config.bcrypt_salt_rounds,
  );

  // 6. Create user and doctor together
  const doctorApplication = await prisma.user.create({
    data: {
      ...payload.user,
      password: hashedPassword,
      role: Role.DOCTOR,
      needPasswordChange: true,

      doctor: {
        create: {
          ...payload.doctor,

          name: payload.user.name,
          email: payload.user.email,

          resume: resumeUploadResult.secure_url,
          resumePublicId: resumeUploadResult.public_id,

          additionalFiles: additionalFilesUploadResults.map((file) => ({
            url: file.secure_url,
            publicId: file.public_id,
          })),
        },
      },
    },
    include: {
      doctor: true,
    },
    omit: {
      password: true,
    },
  });

  // 7. Create OTP & set in the redis

  const expirationSeconds = 60 * 60; // 1 hour

  const otpKey = `doctor-application-otp:${payload.user.email}`;
  const otpValue = crypto.randomInt(100000, 1000000).toString();

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  // 8. Send otp to the email
  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/registration-user-otp.ejs",
  );

  const templateData = {
    name: payload.user.name,
    email: payload.user.email,
    otpValue,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: payload.user.email,
    subject: "Doctor Application - Email Verification",
    html,
  });

  return doctorApplication;
};

const verifyDoctorEmail = async (payload: VerifyDoctorEmailPayload) => {
  const otp = payload.otp;
  const email = payload.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({
    where: {
      email,
      role: Role.DOCTOR,
    },
  });

  if (!existingUser) {
    throw new Error("Doctor application not found. Please apply again.");
  }

  if (existingUser.emailVerified) {
    throw new Error("Email already verified");
  }

  const otpKey = `doctor-application-otp:${email}`;

  const redisOtp = await redisClient.get(otpKey);

  if (!redisOtp) {
    throw new Error(
      "OTP expired. Your application window has closed, please apply again.",
    );
  }

  if (redisOtp !== otp) {
    throw new Error("OTP does not match");
  }

  await redisClient.del(otpKey);

  const verifiedUser = await prisma.user.update({
    where: { id: existingUser.id },
    data: { emailVerified: true },
    omit: { password: true },
    include: { doctor: true },
  });

  return verifiedUser;
};

const approveDoctor = async (
  payload: ApproveDoctorPayload,
  reviewer: RequestUser,
) => {
  const { doctorId, verificationStatus, rejectionReason } = payload;

  const existingDoctor = await prisma.doctor.findUnique({
    where: { id: doctorId },
    include: { user: true },
  });

  if (!existingDoctor) {
    throw new Error("Doctor application not found");
  }

  if (existingDoctor.isDeleted) {
    throw new Error("Doctor application has been deleted");
  }

  if (!existingDoctor.user.emailVerified) {
    throw new Error(
      "Doctor has not verified their email yet. Application cannot be reviewed.",
    );
  }

  if (existingDoctor.verificationStatus !== DoctorVerificationStatus.PENDING) {
    throw new Error(
      `Doctor application has been already ${existingDoctor.verificationStatus.toLocaleLowerCase()}`,
    );
  }

  if (
    verificationStatus === DoctorVerificationStatus.REJECTED &&
    !rejectionReason
  ) {
    throw new Error(
      "Rejection reason is required when rejecting a doctor application",
    );
  }

  const updatedDoctor = await prisma.doctor.update({
    where: { id: doctorId },
    data: {
      verificationStatus,
      rejectionReason:
        verificationStatus === DoctorVerificationStatus.REJECTED
          ? rejectionReason
          : null,
      reviewedBy: reviewer.userId,
      reviewedAt: new Date(),
    },
  });

  const isApproved = verificationStatus === DoctorVerificationStatus.APPROVED;

  const templatePath = path.join(
    process.cwd(),
    `src/app/templates/${
      isApproved
        ? "doctor-application-approved.ejs"
        : "doctor-application-rejected.ejs"
    }`,
  );

  const templateData = {
    name: updatedDoctor.name,
    reason: updatedDoctor.rejectionReason,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: updatedDoctor.email,
    subject: isApproved
      ? "Your doctor application has been approved"
      : "Your doctor application has been rejected",
    html,
  });

  return updatedDoctor;
};

export const DoctorService = {
  applyAsDoctor,
  verifyDoctorEmail,
  approveDoctor,
};
