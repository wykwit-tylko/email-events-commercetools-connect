import { describe, expect, it } from "vitest";
import { CompositePublisher } from "./composite-publisher";
import { FakePublisher } from "../test/test-utils";

describe("CompositePublisher", () => {
  it("publishes to every publisher", async () => {
    const a = new FakePublisher();
    const b = new FakePublisher();
    const composite = new CompositePublisher([a, b]);

    await composite.publish({ type: "OrderCreated" });

    expect(a.published).toHaveLength(1);
    expect(b.published).toHaveLength(1);
  });

  it("attempts every publisher and rejects when any fails", async () => {
    const a = new FakePublisher();
    const b = new FakePublisher();
    b.error = new Error("boom");
    const composite = new CompositePublisher([a, b]);

    await expect(composite.publish({ type: "OrderCreated" })).rejects.toThrow(
      "1 of 2 publisher(s) failed: 1: boom",
    );

    // The successful publisher still recorded the delivery.
    expect(a.published).toHaveLength(1);
  });

  it("reports the original publisher index for each failure", async () => {
    const ok = new FakePublisher();
    const failA = new FakePublisher();
    failA.error = new Error("boom-a");
    const ok2 = new FakePublisher();
    const failB = new FakePublisher();
    failB.error = new Error("boom-b");

    const composite = new CompositePublisher([ok, failA, ok2, failB]);

    // Indexes 1 and 3 failed; the message must preserve those original
    // positions rather than re-numbering them 0 and 1.
    await expect(composite.publish({ type: "OrderCreated" })).rejects.toThrow(
      "2 of 4 publisher(s) failed: 1: boom-a; 3: boom-b",
    );
  });

  it("is ready only when every publisher is ready", () => {
    const a = new FakePublisher();
    const b = new FakePublisher();
    expect(new CompositePublisher([a, b]).isReady()).toBe(true);

    b.ready = false;
    expect(new CompositePublisher([a, b]).isReady()).toBe(false);
  });
});
