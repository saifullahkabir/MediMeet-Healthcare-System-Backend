import type { UploadApiResponse } from "cloudinary";
import { cloudinary } from "../../lib/cloudinary";
import { prisma } from "../../lib/prisma";

const uploadProfileImage = async (buffer: Buffer, userId: string) => {
  const currentUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      imagePublicId: true,
    },
  });

  const cloudinaryResult = await new Promise<UploadApiResponse>(
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
        .end(buffer);
    },
  );

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      imageUrl: cloudinaryResult?.secure_url,
      imagePublicId: cloudinaryResult?.public_id,
    },

    select: {
      imageUrl: true,
      imagePublicId: true,
    },
  });

  if (currentUser?.imagePublicId) {
    await cloudinary.uploader.destroy(currentUser.imagePublicId);
  }

  return updatedUser;
};

export const UserService = {
  uploadProfileImage,
};
