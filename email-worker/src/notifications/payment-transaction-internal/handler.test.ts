import { describe, expect, it } from "vitest";
import { isSuccessfulPaymentTransactionNotification } from "./handler";

describe("isSuccessfulPaymentTransactionNotification", () => {
  it("recognizes successful PaymentTransactionAdded notifications", () => {
    expect(
      isSuccessfulPaymentTransactionNotification({
        notificationType: "Message",
        id: "message-id",
        type: "PaymentTransactionAdded",
        resource: { typeId: "payment", id: "payment-id" },
        transaction: { state: "Success" },
      }),
    ).toBe(true);
  });

  it("recognizes successful PaymentTransactionStateChanged notifications", () => {
    expect(
      isSuccessfulPaymentTransactionNotification({
        notificationType: "Message",
        id: "message-id",
        type: "PaymentTransactionStateChanged",
        resource: { typeId: "payment", id: "payment-id" },
        state: "Success",
      }),
    ).toBe(true);
  });

  it("rejects non-Success Payment transaction notifications", () => {
    expect(
      isSuccessfulPaymentTransactionNotification({
        notificationType: "Message",
        id: "message-id",
        type: "PaymentTransactionStateChanged",
        resource: { typeId: "payment", id: "payment-id" },
        state: "Pending",
      }),
    ).toBe(false);
  });

  it("rejects notifications without a Payment resource", () => {
    expect(
      isSuccessfulPaymentTransactionNotification({
        notificationType: "Message",
        id: "message-id",
        type: "PaymentTransactionStateChanged",
        resource: { typeId: "order", id: "order-id" },
        state: "Success",
      }),
    ).toBe(false);
  });
});
