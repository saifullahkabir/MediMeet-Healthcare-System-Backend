import { OptionalFlat } from "./../../../generated/prisma/internal/prismaNamespace";
import { email } from "zod";
import bcrypt from "bcryptjs";
import type { JwtPayload, SignOptions } from "jsonwebtoken";
import {
  AuthProvider,
  Role,
  UserStatus,
} from "../../../generated/prisma/enums";
import config from "../../config";
import { prisma } from "../../lib/prisma";
import { jwtUtils } from "../../utils/jwt";
import type {
  IForgotPasswordPayload,
  IGoogleLoginPayload,
  ILoginUserPayload,
  IRegisterPatientPayload,
  IRequestUser,
  IResetPasswordPayload,
} from "./auth.interface";
import type { TokenPayload } from "google-auth-library";
import { googleClient } from "../../lib/googleAuth";
import crypto from "node:crypto";
import { redisClient } from "../../lib/redis";
import { transporter } from "../../lib/nodemailer";
import ejs from "ejs";
import path from "node:path";

const registerPatient = async (payload: IRegisterPatientPayload) => {
  const { name, password, patient: patientData } = payload;
  const email = payload.email.trim().toLowerCase();

  const isUserExists = await prisma.user.findUnique({
    where: { email },
  });

  if (isUserExists) {
    throw new Error("User with this email already exists");
  }

  const hashedPassword = await bcrypt.hash(password, config.bcrypt_salt_rounds);

  //* otp save in redis

  const otpValue = crypto.randomInt(100000, 1000000).toString();
  const otpKey = `patient-registration-otp:${email}`;

  const expirationSeconds = 60 * 5;

  await redisClient.set(otpKey, otpValue, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  //* registration data save in redis

  const patientRegistrationKey = `patient-registration-data:${email}`;
  const redisUserDataPayload = {
    name,
    email,
    password: hashedPassword,
    patient: patientData,
  };

  await redisClient.set(
    patientRegistrationKey,
    JSON.stringify(redisUserDataPayload),
    {
      expiration: {
        type: "EX",
        value: expirationSeconds,
      },
    },
  );

  //* send email for registration user otp

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/registration-user-otp.ejs",
  );

  const templateData = {
    name,
    email,
    otpValue,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: email,
    subject: "Email Verification",
    html,
  });

  /**
   * const createdUser = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: Role.PATIENT,
      status: UserStatus.ACTIVE,
      emailVerified: false,
      patient: {
        create: { name, email, contactNumber: patientData?.contactNumber },
      },
    },
    omit: { password: true },
    include: { patient: true },
  });

  const { patient, ...user } = createdUser;
  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    user,
    patient,
    accessToken,
    refreshToken,
  };
   */
};

const loginUser = async (payload: ILoginUserPayload) => {
  const { password } = payload;
  const email = payload.email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    throw new Error("User not found");
  }

  if (user.status === UserStatus.BLOCKED) {
    throw new Error("User is Blocked");
  }

  if (user.isDeleted || user.status === UserStatus.DELETED) {
    throw new Error("User is Deleted");
  }

  if (user.password === null && user.googleId !== null) {
    throw new Error(
      "User already registered with google! Try to login with google",
    );
  }

  const isPasswordMatched = await bcrypt.compare(
    password,
    user.password as string,
  );

  if (!isPasswordMatched) {
    throw new Error("Invalid credentials");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const getMe = async (user: IRequestUser) => {
  const isUserExists = await prisma.user.findUnique({
    where: {
      id: user.userId,
    },
    include: {
      patient: true,
    },
    omit: {
      password: true,
    },
  });

  if (!isUserExists) {
    throw new Error("User not found");
  }

  return isUserExists;
};

const refreshToken = async (token: string) => {
  const verifiedRefreshToken = jwtUtils.verifyToken(
    token,
    config.jwt_refresh_secret,
  );

  if (!verifiedRefreshToken.success || !verifiedRefreshToken.data) {
    throw new Error(
      config.node_env === "development"
        ? verifiedRefreshToken.error
        : "Invalid refresh token",
    );
  }

  const data = verifiedRefreshToken.data as JwtPayload;

  const user = await prisma.user.findUnique({
    where: { id: data.userId },
  });

  if (!user || user.isDeleted || user.status !== UserStatus.ACTIVE) {
    throw new Error("User is inactive or not found");
  }

  const jwtPayload = {
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  const accessToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_access_secret,
    config.jwt_access_expires_in as SignOptions,
  );

  const refreshToken = jwtUtils.createToken(
    jwtPayload,
    config.jwt_refresh_secret,
    config.jwt_refresh_expires_in as SignOptions,
  );

  return {
    accessToken,
    refreshToken,
  };
};

const googleLogin = async (payload: IGoogleLoginPayload) => {
  let googleIdTokenPayload: TokenPayload | null | undefined = null;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: payload.idToken,
      audience: config.google_client_id,
    });

    googleIdTokenPayload = ticket.getPayload();

    if (!googleIdTokenPayload) {
      throw new Error("Invalid Or Expired Google Id Token");
    }

    if (!googleIdTokenPayload.email) {
      throw new Error("Google Email Not Found");
    }

    if (!googleIdTokenPayload.name) {
      throw new Error("Google Email User Name Not Found");
    }

    const isPatientExistWithGoogleAuth = await prisma.user.findUnique({
      where: {
        email: googleIdTokenPayload.email,
        role: Role.PATIENT,
        id: googleIdTokenPayload.sub,
      },
    });

    let user = isPatientExistWithGoogleAuth;

    if (!isPatientExistWithGoogleAuth) {
      const isPatientExistWithCredentials = await prisma.user.findUnique({
        where: {
          email: googleIdTokenPayload.email,
          role: Role.PATIENT,
          authProvider: AuthProvider.CREDENTIAL,
        },
      });

      if (isPatientExistWithCredentials) {
        if (!isPatientExistWithCredentials.emailVerified) {
          throw new Error("Email not verified");
        }

        if (isPatientExistWithCredentials.status === UserStatus.BLOCKED) {
          throw new Error("User is Blocked");
        }

        if (
          isPatientExistWithCredentials.isDeleted ||
          isPatientExistWithCredentials.status === UserStatus.DELETED
        ) {
          throw new Error("User is Deleted");
        }

        user = await prisma.user.update({
          where: {
            id: isPatientExistWithCredentials.id,
          },
          data: {
            googleId: googleIdTokenPayload.sub,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            name: googleIdTokenPayload.name,
            email: googleIdTokenPayload.email,
            role: Role.PATIENT,
            googleId: googleIdTokenPayload.sub,
            authProvider: AuthProvider.GOOGLE,
            emailVerified: true,
            patient: {
              create: {
                name: googleIdTokenPayload.name,
                email: googleIdTokenPayload.email,
              },
            },
          },
        });
      }
    }

    if (!user) {
      throw new Error("User not found");
    }

    if (user.status === UserStatus.BLOCKED) {
      throw new Error("User is Blocked");
    }

    if (user.isDeleted || user.status === UserStatus.DELETED) {
      throw new Error("User is Deleted");
    }

    const jwtPayload = {
      userId: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwtUtils.createToken(
      jwtPayload,
      config.jwt_access_secret,
      config.jwt_access_expires_in as SignOptions,
    );

    const refreshToken = jwtUtils.createToken(
      jwtPayload,
      config.jwt_refresh_secret,
      config.jwt_refresh_expires_in as SignOptions,
    );

    return {
      accessToken,
      refreshToken,
    };
  } catch (error) {
    console.log("Google Id Token Verification Failed", error);
    throw new Error("Invalid Or Expired Google Id Token!");
  }
};

const forgotPassword = async (payload: IForgotPasswordPayload) => {
  const { email } = payload;

  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new Error("User doesn't exist!");
  }

  if (!isUserExist.emailVerified) {
    throw new Error("User not Verified");
  }

  if (isUserExist.status === UserStatus.BLOCKED) {
    throw new Error("User is Blocked!");
  }

  if (isUserExist.isDeleted || isUserExist.status === UserStatus.DELETED) {
    throw new Error("User is Deleted!");
  }

  if (
    isUserExist.googleId &&
    isUserExist.authProvider === AuthProvider.GOOGLE
  ) {
    throw new Error("User has account with Google");
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const key = `forgot-password-otp:${isUserExist.email}`;

  const expirationSeconds = 60 * 5;

  await redisClient.set(key, otp, {
    expiration: {
      type: "EX",
      value: expirationSeconds,
    },
  });

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/forgot-password.ejs",
  );

  const templateData = {
    name: isUserExist.name,
    otp,
    expirationMinutes: expirationSeconds / 60,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExist.email,
    subject: "Forgot Password",
    // text: `Your OTP is ${otp}`,
    // html: `<h3>Your OTP is ${otp}</h3>`,
    html: html,
  });
};

const resetPassword = async (payload: IResetPasswordPayload) => {
  const { email, otp, newPassword } = payload;

  const isUserExist = await prisma.user.findUnique({
    where: {
      email,
    },
  });

  if (!isUserExist) {
    throw new Error("User doesn't exist!");
  }

  if (!isUserExist.emailVerified) {
    throw new Error("User not Verified");
  }

  if (isUserExist.status === UserStatus.BLOCKED) {
    throw new Error("User is Blocked!");
  }

  if (isUserExist.isDeleted || isUserExist.status === UserStatus.DELETED) {
    throw new Error("User is Deleted!");
  }

  if (
    isUserExist.googleId &&
    isUserExist.authProvider === AuthProvider.GOOGLE
  ) {
    throw new Error("User has account with Google");
  }

  const key = `forgot-password-otp:${isUserExist.email}`;

  const redisOtp = await redisClient.get(key);

  if (!redisOtp) {
    throw new Error("Invalid OTP");
  }

  if (redisOtp !== otp) {
    throw new Error("OTP doesn't match!");
  }

  const hashedNewPassword = await bcrypt.hash(
    newPassword,
    config.bcrypt_salt_rounds,
  );

  await prisma.user.update({
    where: {
      email: isUserExist.email,
    },
    data: {
      password: hashedNewPassword,
    },
  });

  await redisClient.del([key]);

  const templatePath = path.join(
    process.cwd(),
    "src/app/templates/reset-password-success.ejs",
  );

  const templateData = {
    name: isUserExist.name,
  };

  const html = await ejs.renderFile(templatePath, templateData);

  await transporter.sendMail({
    from: config.email_sender,
    to: isUserExist.email,
    subject: "Password changed successfully",
    html: html,
  });
};

export const AuthService = {
  registerPatient,
  loginUser,
  getMe,
  refreshToken,
  googleLogin,
  forgotPassword,
  resetPassword,
};
