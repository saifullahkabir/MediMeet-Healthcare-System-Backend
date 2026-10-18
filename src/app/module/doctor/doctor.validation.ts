import { z } from "zod";

const userSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters"),
  email: z.string().trim().email("Invalid email address"),
});

const doctorSchema = z.object({
  address: z.string().trim().optional(),

  specialization: z.string().trim().min(2, "Specialization is required"),

  licenseNumber: z.string().trim().min(1, "License number is required"),

  qualifications: z.string().trim().min(1, "Qualifications are required"),

  experienceYears: z.coerce
    .number()
    .int("Experience years must be an integer")
    .min(0, "Experience years cannot be negative"),

  bio: z.string().trim().optional(),

  consultationFee: z.coerce
    .number()
    .min(0, "Consultation fee cannot be negative")
    .optional(),

  contactNumber: z.string().trim().optional(),
});

export const applyAsDoctorValidationSchema = z.object({
  user: userSchema,
  doctor: doctorSchema,
});
