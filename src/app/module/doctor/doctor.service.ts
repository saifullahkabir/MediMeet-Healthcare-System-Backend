import type { UploadApiResponse } from "cloudinary";
import { prisma } from "../../lib/prisma";
import type { ApplyAsDoctorPayload } from "./doctor.interface";
import { cloudinary } from "../../lib/cloudinary";
import { Role } from "../../../generated/prisma/enums";
import bcrypt from "bcryptjs";
import config from "../../config";

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

  // 2. Upload resume
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

  // 3. Upload additional files
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

  // 4. password generator
  const randomDoctorPassword = Math.random().toString(36).slice(-8);

  const hashedPassword = await bcrypt.hash(
    randomDoctorPassword,
    config.bcrypt_salt_rounds,
  );

  // 5. Create user and doctor together
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

  return doctorApplication;
};

export const DoctorService = {
  applyAsDoctor,
};
