import httpStatus from "http-status";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../utils/AppError";
import type { RequestUser } from "./../../middleware/checkAuth";
import type {
  ICreateSchedulePayload,
  IUpdateSchedulePayload,
} from "./schedule.interface";
import { addDays, differenceInMinutes, startOfDay } from "date-fns";
import type { IQuery } from "../../interfaces";
import type { ScheduleWhereInput } from "../../../generated/prisma/models";
import { ScheduleStatus } from "../../../generated/prisma/enums";

const createSchedule = async (
  payload: ICreateSchedulePayload,
  user: RequestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
  }

  const startOfTheDay = startOfDay(payload.startDateTime); // 19 November => 12:00 AM

  const startOfNextDay = addDays(startOfTheDay, 1); // 20 November => 12:00 AM

  const existingScheduleOnThisDate = await prisma.schedule.findFirst({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      startDateTime: {
        gte: startOfTheDay,
        lt: startOfNextDay,
      },
    },
  });

  if (existingScheduleOnThisDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a schedule for this date",
    );
  }

  const durationInMinutes = differenceInMinutes(
    payload.startDateTime,
    payload.endDateTime,
  );

  const MINUTES_ALLOCATED_PER_SLOT = 20;

  const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

  const schedule = await prisma.schedule.create({
    data: {
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      meetingLink: payload.meetingLink,
      totalSlots,
      availableSlots: totalSlots,
      doctorId: doctor.id,
    },
    include: {
      doctor: {
        select: {
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return schedule;
};

const getMySchedules = async (query: IQuery, user: RequestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!doctor) {
    throw new AppError(httpStatus.CONFLICT, "Doctor profile not found");
  }

  const limit = query.limit ? Number(query.limit) : 9;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ScheduleWhereInput[] = [
    {
      doctorId: doctor.id,
    },
    {
      isDeleted: false,
    },
  ];

  if (query.status) {
    andConditions.push({ status: query.status as ScheduleStatus });
  }

  const schedule = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip: skip,

    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },

    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({
    where: { AND: andConditions },
  });

  return {
    data: schedule,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getAllSchedules = async (query: IQuery) => {
  const limit = query.limit ? Number(query.limit) : 9;
  const page = query.page ? Number(query.page) : 1;
  const skip = (page - 1) * limit;
  const sortBy = query.sortBy ? query.sortBy : "createdAt";
  const sortOrder = query.sortOrder ? query.sortOrder : "desc";

  const andConditions: ScheduleWhereInput[] = [];

  if (query.searchTerm) {
    andConditions.push({
      doctor: {
        OR: [
          { name: { contains: query.searchTerm, mode: "insensitive" } },
          { email: { contains: query.searchTerm, mode: "insensitive" } },
          {
            specialization: { contains: query.searchTerm, mode: "insensitive" },
          },
          {
            contactNumber: { contains: query.searchTerm, mode: "insensitive" },
          },
        ],
      },
    });
  }

  if (query.doctorId) {
    andConditions.push({ doctorId: query.doctorId });
  }

  if (query.email) {
    andConditions.push({
      doctor: {
        email: query.email,
      },
    });
  }

  if (query.contactNumber) {
    andConditions.push({
      doctor: {
        contactNumber: query.contactNumber,
      },
    });
  }

  if (query.status) {
    andConditions.push({ status: query.status as ScheduleStatus });
  }

  const schedule = await prisma.schedule.findMany({
    where: {
      AND: andConditions,
    },

    take: limit,
    skip: skip,

    orderBy: {
      // sortBy : sortOrder
      [sortBy]: sortOrder,
    },

    include: {
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  const total = await prisma.schedule.count({
    where: { AND: andConditions },
  });

  return {
    data: schedule,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
};

const getScheduleById = async (scheduleId: string) => {
  const schedule = await prisma.schedule.findUnique({
    where: {
      id: scheduleId,
    },
    include: {
      doctor: {
        select: {
          id: true,
          name: true,
          email: true,
          contactNumber: true,
          specialization: true,
          userId: true,
          experienceYears: true,
          consultationFee: true,
        },
      },
      appointments: {
        include: {
          patient: true,
        },
      },
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  return schedule;
};

const updateSchedule = async (
  scheduleId: string,
  payload: IUpdateSchedulePayload,
  user: RequestUser,
) => {
  const doctor = await prisma.doctor.findUnique({
    where: {
      userId: user.userId,
    },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
  }

  const schedule = await prisma.schedule.findUnique({
    where: {
      id: scheduleId,
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  if (schedule.doctorId !== doctor.id) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      "You are not allowed to update this schedule",
    );
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    schedule.totalSlots !== schedule.availableSlots
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Cannot update a published schedule with existing bookings",
    );
  }

  // const updateData: IUpdateSchedulePayload = {};

  // if(payload.meetingLink) {
  //   updateData.meetingLink = payload.meetingLink ?? schedule.meetingLink
  // }

  payload.meetingLink = payload.meetingLink ?? schedule.meetingLink;
  payload.startDateTime = payload.startDateTime ?? schedule.startDateTime;
  payload.endDateTime = payload.endDateTime ?? schedule.endDateTime;

  const startOfTheDay = startOfDay(payload.startDateTime); // 19 November => 12:00 AM

  const startOfNextDay = addDays(startOfTheDay, 1); // 20 November => 12:00 AM

  const existingScheduleOnThisDate = await prisma.schedule.findFirst({
    where: {
      doctorId: doctor.id,
      isDeleted: false,
      startDateTime: {
        gte: startOfTheDay,
        lt: startOfNextDay,
      },
    },
  });

  if (existingScheduleOnThisDate) {
    throw new AppError(
      httpStatus.CONFLICT,
      "You already have a schedule for this date",
    );
  }

  const durationInMinutes = differenceInMinutes(
    payload.startDateTime,
    payload.endDateTime,
  );

  const MINUTES_ALLOCATED_PER_SLOT = 20;

  const totalSlots = Math.floor(durationInMinutes / MINUTES_ALLOCATED_PER_SLOT);

  const updatedSchedule = await prisma.schedule.update({
    where: {
      id: schedule.id,
    },
    data: {
      startDateTime: payload.startDateTime,
      endDateTime: payload.endDateTime,
      meetingLink: payload.meetingLink,
      totalSlots,
      availableSlots: totalSlots,
      doctorId: doctor.id,
    },
    include: {
      doctor: {
        select: {
          name: true,
          email: true,
          contactNumber: true,
        },
      },
    },
  });

  return updatedSchedule;
};

const publishSchedule = async (scheduleId: string, user: RequestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
  }

  const schedule = await prisma.schedule.findUnique({
    where: {
      id: scheduleId,
      doctorId: doctor.id,
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  if (schedule.status === ScheduleStatus.PUBLISHED) {
    throw new AppError(httpStatus.CONFLICT, "Schedule is already published");
  }

  const publishedSchedule = await prisma.schedule.update({
    where: {
      id: schedule.id,
    },
    data: {
      status: ScheduleStatus.PUBLISHED,
    },
  });

  return publishedSchedule;
};

const deleteSchedule = async (scheduleId: string, user: RequestUser) => {
  const doctor = await prisma.doctor.findUnique({
    where: { userId: user.userId },
  });

  if (!doctor) {
    throw new AppError(httpStatus.NOT_FOUND, "Doctor profile not found");
  }

  const schedule = await prisma.schedule.findUnique({
    where: {
      id: scheduleId,
      doctorId: doctor.id,
    },
  });

  if (!schedule || schedule.isDeleted) {
    throw new AppError(httpStatus.NOT_FOUND, "Schedule not found");
  }

  if (
    schedule.status === ScheduleStatus.PUBLISHED &&
    schedule.totalSlots !== schedule.availableSlots
  ) {
    throw new AppError(
      httpStatus.CONFLICT,
      "Cannot delete a published schedule with existing bookings",
    );
  }

  const deletedSchedule = await prisma.schedule.update({
    where: {
      id: schedule.id,
    },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
    },
  });

  return deletedSchedule;
};

export const ScheduleService = {
  createSchedule,
  getMySchedules,
  getAllSchedules,
  getScheduleById,
  updateSchedule,
  publishSchedule,
  deleteSchedule,
};
