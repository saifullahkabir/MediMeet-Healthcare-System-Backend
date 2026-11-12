import cron from "node-cron";
import { prisma } from "./prisma";
import { DoctorVerificationStatus, Role } from "../../generated/prisma/enums";

export const deleteUnverifiedDoctors = () => {
  console.log("Unverified doctor deletion cron initialized");

  cron.schedule("*/10 * * * *", async () => {
    console.log("Cron: Checking unverified doctors...");

    try {
      // 1 hour ago
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

      const deletedDoctors = await prisma.user.deleteMany({
        where: {
          role: Role.DOCTOR,
          emailVerified: false,
          createdAt: {
            lte: oneHourAgo,
          },
          doctor: {
            is: {
              verificationStatus: DoctorVerificationStatus.PENDING,
            },
          },
        },
      });

      console.log(`Cron: Deleted ${deletedDoctors.count} unverified doctors`);
    } catch (error) {
      console.error("Cron: Failed to delete unverified doctors", error);
    }
  });
};
