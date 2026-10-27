import { email, string } from "zod";

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
