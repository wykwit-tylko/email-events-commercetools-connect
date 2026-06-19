import { describe, expect, it } from "vitest";
import { isCustomerEmailTokenCreatedNotification } from "./handler";

describe("isCustomerEmailTokenCreatedNotification", () => {
  it("recognizes valid email token notifications", () => {
    const notification = {
      notificationType: "Message",
      id: "message-id",
      type: "CustomerEmailTokenCreated",
      customerId: "customer-id",
      customerEmail: "user@example.com",
      expiresAt: "2026-06-10T12:00:00.000Z",
      value: "token-123",
    };

    expect(isCustomerEmailTokenCreatedNotification(notification)).toBe(true);
  });

  it("rejects missing value", () => {
    expect(
      isCustomerEmailTokenCreatedNotification({
        notificationType: "Message",
        id: "message-id",
        type: "CustomerEmailTokenCreated",
        customerId: "customer-id",
        customerEmail: "user@example.com",
      }),
    ).toBe(false);
  });

  it("rejects missing customerEmail", () => {
    expect(
      isCustomerEmailTokenCreatedNotification({
        notificationType: "Message",
        id: "message-id",
        type: "CustomerEmailTokenCreated",
        customerId: "customer-id",
        value: "token-123",
      }),
    ).toBe(false);
  });
});
