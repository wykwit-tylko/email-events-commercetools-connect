import { describe, expect, it } from "vitest";
import { renderPaymentTransactionInternalEmail } from "./template";

const storeUrl = "https://example.com";

describe("renderPaymentTransactionInternalEmail", () => {
  it("renders verbose PaymentTransactionAdded details", () => {
    const email = renderPaymentTransactionInternalEmail(
      {
        notificationType: "Message",
        id: "payment-added-id",
        type: "PaymentTransactionAdded",
        resource: { typeId: "payment", id: "payment-id" },
        resourceVersion: 12,
        sequenceNumber: 34,
        createdAt: "2026-06-20T12:00:00.000Z",
        transaction: {
          id: "transaction-id",
          type: "Charge",
          state: "Success",
          amount: { centAmount: 12345, currencyCode: "EUR" },
          interfaceId: "psp-transaction-id",
          interactionId: "psp-interaction-id",
        },
      },
      storeUrl,
    );

    expect(email.subject).toBe("Payment transaction succeeded: payment-id");
    expect(email.html).toContain(
      "https://mc.europe-west1.gcp.commercetools.com/shelfmarket/payments/payment-id",
    );
    expect(email.html).toContain("transaction-id");
    expect(email.html).toContain("psp-transaction-id");
    expect(email.text).toContain("Transaction type: Charge");
    expect(email.text).toContain("Transaction amount: {\"centAmount\":12345,\"currencyCode\":\"EUR\"}");
  });

  it("renders PaymentTransactionStateChanged details without transaction type", () => {
    const email = renderPaymentTransactionInternalEmail(
      {
        notificationType: "Message",
        id: "payment-state-id",
        type: "PaymentTransactionStateChanged",
        resource: { typeId: "payment", id: "payment-id" },
        transactionId: "transaction-id",
        state: "Success",
      },
      storeUrl,
    );

    expect(email.text).toContain("Transaction ID: transaction-id");
    expect(email.text).toContain("Transaction state: Success");
    expect(email.text).not.toContain("Transaction type:");
  });

  it("encodes Payment IDs in Merchant Center links", () => {
    const email = renderPaymentTransactionInternalEmail(
      {
        notificationType: "Message",
        id: "payment-state-id",
        type: "PaymentTransactionStateChanged",
        resource: { typeId: "payment", id: "payment/id" },
        state: "Success",
      },
      storeUrl,
    );

    expect(email.html).toContain(
      "https://mc.europe-west1.gcp.commercetools.com/shelfmarket/payments/payment%2Fid",
    );
  });
});
