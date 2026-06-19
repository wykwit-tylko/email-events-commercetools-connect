import { describe, expect, it } from "vitest";
import { renderPasswordResetEmail } from "./template";

describe("renderPasswordResetEmail", () => {
  it("renders password reset email linking to the storefront login page", () => {
    const email = renderPasswordResetEmail(
      {
        notificationType: "Message",
        id: "msg-id",
        type: "CustomerPasswordTokenCreated",
        customerId: "cust-id",
        customerEmail: "user@example.com",
        expiresAt: "2026-06-10T12:00:00.000Z",
        value: "reset-token-456",
      },
      "https://shelfmarket.tylko.dev",
    );

    expect(email.subject).toBe("Reset your ShelfMarket password");
    expect(email.html).toContain("https://shelfmarket.tylko.dev/login?reset_token=reset-token-456");
    expect(email.text).toContain("https://shelfmarket.tylko.dev/login?reset_token=reset-token-456");
    expect(email.html).toContain("Reset your password");
    expect(email.html).toContain("This email was sent to user@example.com.");
  });

  it("does not leak the customer email into the reset link", () => {
    const email = renderPasswordResetEmail(
      {
        notificationType: "Message",
        id: "msg-id",
        type: "CustomerPasswordTokenCreated",
        customerId: "cust-id",
        customerEmail: "user@example.com",
        expiresAt: "2026-06-10T12:00:00.000Z",
        value: "reset-token-456",
      },
      "https://shelfmarket.tylko.dev",
    );

    expect(email.html).not.toContain("email=user");
    expect(email.text).not.toContain("email=user");
  });

  it("escapes HTML in token and email", () => {
    const email = renderPasswordResetEmail(
      {
        notificationType: "Message",
        id: "msg-id",
        type: "CustomerPasswordTokenCreated",
        customerId: "cust-id",
        customerEmail: "user+test<script>@example.com",
        expiresAt: "2026-06-10T12:00:00.000Z",
        value: "<token>",
      },
      "https://shelfmarket.tylko.dev",
    );

    expect(email.html).not.toContain("<token>");
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("user+test&lt;script&gt;@example.com");
  });
});
