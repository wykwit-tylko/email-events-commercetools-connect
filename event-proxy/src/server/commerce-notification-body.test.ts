import { describe, expect, it } from "vitest";
import { extractCommerceNotificationBody } from "./commerce-notification-body.js";

describe("extractCommerceNotificationBody", () => {
  it("returns raw body when no transport envelope is present", () => {
    const rawBody = Buffer.from('{"type":"OrderCreated"}');

    const result = extractCommerceNotificationBody({
      rawBody,
      contentType: "application/json",
      maxBodyBytes: 1024,
    });

    expect(result.body.equals(rawBody)).toBe(true);
    expect(result.contentType).toBe("application/json");
  });

  it("decodes Google Cloud Pub/Sub message.data", () => {
    const commerceNotification = Buffer.from('{"type":"OrderCreated"}');
    const rawBody = Buffer.from(
      JSON.stringify({
        message: { data: commerceNotification.toString("base64") },
      }),
    );

    const result = extractCommerceNotificationBody({
      rawBody,
      connectSubscriptionDestination: "GoogleCloudPubSub",
      maxBodyBytes: 1024,
    });

    expect(result.body.equals(commerceNotification)).toBe(true);
  });

  it("decodes AWS SNS Message", () => {
    const commerceNotification = '{"type":"OrderCreated"}';
    const rawBody = Buffer.from(JSON.stringify({ Message: commerceNotification }));

    const result = extractCommerceNotificationBody({
      rawBody,
      connectSubscriptionDestination: "SNS",
      maxBodyBytes: 1024,
    });

    expect(result.body.toString("utf8")).toBe(commerceNotification);
  });
});
