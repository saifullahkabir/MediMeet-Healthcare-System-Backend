import { AppointmentStatus } from "../../../generated/prisma/enums";
import config from "../../config";
import { getBkashIdToken } from "../../lib/bkash";
import { prisma } from "../../lib/prisma";
import type { RequestUser } from "../../middleware/checkAuth";

const bookAppointment = async (payload: any, user: RequestUser) => {
  const transactionResult = await prisma.$transaction(async (tx) => {
    //* 3. appointment create
    const appointment = await tx.appointment.create({
      data: {
        status: AppointmentStatus.PENDING,
      },
    });

    //* 2. bkash create payment
    const bkashIdToken = await getBkashIdToken();

    if (!bkashIdToken) {
      throw new Error("Bkash access token not found!");
    }

    const bkashCreatePaymentResponse = await fetch(
      `${config.bkash_base_url}/tokenized/checkout/create`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: bkashIdToken,
          "X-App-Key": config.bkash_app_key,
        },

        body: JSON.stringify({
          // agreem entID: "TokenizedMerchant01L3IKB6H1565072174986", // appointment id
          mode: "0011", //* must be 0011, now 0001 is not accepted
          payerReference: user.email, // user email or phone number
          callbackURL: `${config.bkash_callback_url}/appointment/book-appointment/payment/callback`,
          // merchantAssociationInfo: "MI05MID54RF09123456One",
          amount: "1200",
          currency: "BDT",
          intent: "sale",
          // merchantInvoiceNumber: "Inv0124",
          merchantInvoiceNumber: appointment.id,
        }),
      },
    );

    const bkashCreatePaymentResult = await bkashCreatePaymentResponse.json();

    //* 3. payment model create
    await tx.payment.create({
      data: {
        merchantInvoiceNumber: bkashCreatePaymentResult.merchantInvoiceNumber,
        appointmentId: appointment.id,
        amount: "1200",
        gatewayResponse: bkashCreatePaymentResult,
        bkashPaymentId: bkashCreatePaymentResult.paymentID,
        payerReference: user.email,
      },
    });

    return bkashCreatePaymentResult.bkashURL;
  });

  return transactionResult;
};

const bookAppointmentCallback = async (query: Record<string, unknown>) => {
  const paymentId = query.paymentID;

  if (!paymentId) {
    throw new Error("Payment id is missing");
  }
  const status = query.status;

  if (!status) {
    throw new Error("Payment status is missing");
  }

  const bkashIdToken = await getBkashIdToken();

  if (!bkashIdToken) {
    throw new Error("Bkash access token not found!");
  }

  const executedPaymentResponse = await fetch(
    `${config.bkash_base_url}/tokenized/checkout/execute`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: bkashIdToken,
        "X-App-Key": config.bkash_app_key,
      },
      body: JSON.stringify({
        paymentID: paymentId,
      }),
    },
  );

  const executedPaymentResult = await executedPaymentResponse.json();

  if (status === "success") {
    return {
      executedPaymentResult,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=success`,
    };
  }

  if (status === "failure") {
    return {
      executedPaymentResult,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=failure`,
    };
  }

  if (status === "cancel") {
    return {
      executedPaymentResult,
      redirectUrl: `${config.frontend_url}/dashboard/my-appointments?status=cancel`,
    };
  }

  return {
    executedPaymentResult,
    redirectUrl: `${config.frontend_url}/dashboard/my-appointments`,
  };
};

export const AppointmentService = {
  bookAppointment,
  bookAppointmentCallback,
};
