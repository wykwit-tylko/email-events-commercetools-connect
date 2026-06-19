import { describe, expect, it } from "vitest";
import { InvalidCommerceNotificationJsonError, toQueueCommerceNotification } from "./queue-payload";

describe("toQueueCommerceNotification", () => {
  it("parses JSON objects", () => {
    expect(toQueueCommerceNotification(Buffer.from('{"type":"OrderCreated"}'))).toEqual({
      type: "OrderCreated",
    });
  });

  it("rejects invalid JSON", () => {
    expect(() => toQueueCommerceNotification(Buffer.from("not-json"))).toThrow(
      InvalidCommerceNotificationJsonError,
    );
  });

  it("rejects non-object JSON", () => {
    expect(() => toQueueCommerceNotification(Buffer.from("[]"))).toThrow(
      InvalidCommerceNotificationJsonError,
    );
  });
});
