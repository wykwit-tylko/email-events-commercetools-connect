import { describe, expect, it } from "vitest";
import { CompositePublisher } from "./composite-publisher";
import {
  createDeferred,
  createSilentLogger,
  FakePublisher,
  flushAsyncWork,
} from "../test/test-utils";

describe("CompositePublisher", () => {
  it("requires at least one publisher", () => {
    expect(() => new CompositePublisher([], createSilentLogger())).toThrow(
      "CompositePublisher requires at least one publisher",
    );
  });

  it("publishes to every publisher", async () => {
    const a = new FakePublisher();
    const b = new FakePublisher();
    const composite = new CompositePublisher([a, b], createSilentLogger());

    await composite.publish({ type: "OrderCreated" });
    await flushAsyncWork();

    expect(a.published).toHaveLength(1);
    expect(b.published).toHaveLength(1);
  });

  it("resolves as soon as one publisher succeeds while another is still pending", async () => {
    const fast = new FakePublisher();
    const delayed = new FakePublisher();
    const gate = createDeferred();
    delayed.delayUntil = gate.promise;
    const composite = new CompositePublisher([fast, delayed], createSilentLogger());

    await expect(composite.publish({ type: "OrderCreated" })).resolves.toBeUndefined();

    expect(fast.published).toHaveLength(1);
    expect(delayed.published).toHaveLength(0);

    gate.resolve();
    await flushAsyncWork();
    expect(delayed.published).toHaveLength(1);
  });

  it("resolves when at least one publisher succeeds and another fails", async () => {
    const ok = new FakePublisher();
    const failing = new FakePublisher();
    failing.error = new Error("boom");
    const logger = createSilentLogger();
    const composite = new CompositePublisher([ok, failing], logger);

    await expect(composite.publish({ type: "OrderCreated" })).resolves.toBeUndefined();
    await flushAsyncWork();

    // The successful publisher still recorded the delivery.
    expect(ok.published).toHaveLength(1);
    // The failed publisher's index and reason are surfaced for monitoring.
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: "outbound publisher failed",
        fields: expect.objectContaining({
          publisherIndex: 1,
          publisherCount: 2,
          reason: "boom",
        }),
      }),
    );
  });

  it("resolves when a slow publisher succeeds after a fast one fails", async () => {
    const fastFail = new FakePublisher();
    fastFail.error = new Error("instant-fail");
    const slowSuccess = new FakePublisher();
    const gate = createDeferred();
    slowSuccess.delayUntil = gate.promise;
    const logger = createSilentLogger();
    const composite = new CompositePublisher([fastFail, slowSuccess], logger);

    const publish = composite.publish({ type: "OrderCreated" });
    await flushAsyncWork();

    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: "outbound publisher failed",
        fields: expect.objectContaining({ publisherIndex: 0 }),
      }),
    );

    gate.resolve();
    await expect(publish).resolves.toBeUndefined();
    expect(slowSuccess.published).toHaveLength(1);

    // The partial-forward summary fires once at success time, listing the
    // failures that accumulated before the first success.
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "info",
        message: "commerce notification partially forwarded",
        fields: expect.objectContaining({
          successfulPublisherIndex: 1,
          failedPublishers: [{ index: 0, reason: "instant-fail" }],
        }),
      }),
    );
  });

  it("logs each failure with its original publisher index on partial success", async () => {
    const ok = new FakePublisher();
    const failA = new FakePublisher();
    failA.error = new Error("boom-a");
    const ok2 = new FakePublisher();
    const failB = new FakePublisher();
    failB.error = new Error("boom-b");
    const logger = createSilentLogger();

    const composite = new CompositePublisher([ok, failA, ok2, failB], logger);

    await expect(composite.publish({ type: "OrderCreated" })).resolves.toBeUndefined();
    await flushAsyncWork();

    const warnedIndexes = logger.entries
      .filter((entry) => entry.message === "outbound publisher failed")
      .map((entry) => (entry.fields as { publisherIndex: number }).publisherIndex)
      .sort((x, y) => x - y);

    // Indexes 1 and 3 failed while 0 and 2 succeeded; the failures are
    // reported with their original positions, not re-numbered.
    expect(warnedIndexes).toEqual([1, 3]);
    expect(warnedIndexes).toHaveLength(2);
  });

  it("rejects only when every publisher fails, aggregating the original indexes", async () => {
    const failA = new FakePublisher();
    failA.error = new Error("boom-a");
    const failB = new FakePublisher();
    failB.error = new Error("boom-b");
    const logger = createSilentLogger();
    const composite = new CompositePublisher([failA, failB], logger);

    await expect(composite.publish({ type: "OrderCreated" })).rejects.toThrow(
      "all 2 outbound publishers failed: 0: boom-a; 1: boom-b",
    );

    // Each individual failure is still logged at warn level.
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: "outbound publisher failed",
        fields: expect.objectContaining({ publisherIndex: 0, reason: "boom-a" }),
      }),
    );
    expect(logger.entries).toContainEqual(
      expect.objectContaining({
        level: "warn",
        message: "outbound publisher failed",
        fields: expect.objectContaining({ publisherIndex: 1, reason: "boom-b" }),
      }),
    );
  });

  it("reports all failures ordered by publisher index even when they settle out of order", async () => {
    const slowFail = new FakePublisher();
    const gate = createDeferred();
    slowFail.delayUntil = gate.promise;
    slowFail.error = new Error("slow-fail");
    const fastFail = new FakePublisher();
    fastFail.error = new Error("fast-fail");

    const composite = new CompositePublisher([slowFail, fastFail], createSilentLogger());
    const publish = composite.publish({ type: "OrderCreated" });

    await flushAsyncWork();
    gate.resolve();

    // Publisher 1 fails before publisher 0, but the error message must list
    // them in publisher-index order so it maps to OUTBOUND_PUBLISHER_CONFIG.
    await expect(publish).rejects.toThrow(
      "all 2 outbound publishers failed: 0: slow-fail; 1: fast-fail",
    );
  });

  it("delegates directly to the single publisher when only one is configured", async () => {
    const only = new FakePublisher();
    const composite = new CompositePublisher([only], createSilentLogger());

    await composite.publish({ type: "OrderCreated" });

    expect(only.published).toHaveLength(1);
  });

  it("is ready only when every publisher is ready", () => {
    const a = new FakePublisher();
    const b = new FakePublisher();
    expect(new CompositePublisher([a, b], createSilentLogger()).isReady()).toBe(true);

    b.ready = false;
    expect(new CompositePublisher([a, b], createSilentLogger()).isReady()).toBe(false);
  });
});
