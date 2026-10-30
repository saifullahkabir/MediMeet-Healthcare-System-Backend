import { email, string } from "zod";
import { DoctorVerificationStatus } from "../../../generated/prisma/enums";

export interface ApplyAsDoctorPayload {
  user: {
    name: string;
    email: string;
    password?: string;
    role?: string;
  };

  doctor: {
    address?: string;
    specialization: string;
    licenseNumber: string;
    qualifications: string;
    experienceYears: number;
    bio?: string;
    consultationFee?: number;
    contactNumber?: string;
  };
}

export interface VerifyDoctorEmailPayload {
  email: string;
  otp: string;
}

export interface ApproveDoctorPayload {
  doctorId: string;
  verificationStatus: DoctorVerificationStatus;
  rejectionReason: string;
}
