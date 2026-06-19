import type {
  CommerceNotificationPublisher,
  PublishOptions,
} from "./commerce-notification-publisher.js";

/**
 * Fans a Commerce Notification out to every configured Outbound Publisher. All
 * publishers are attempted in parallel; if any rejects, the whole call rejects
 * so commercetools redelivers. Every consumer must therefore be idempotent
 * (the queue relies on its own dedupe; the HTTP webhook relies on the
 * receiver's replay cache).
 */
export class CompositePublisher implements CommerceNotificationPublisher {
  constructor(private readonly publishers: ReadonlyArray<CommerceNotificationPublisher>) {}

  async publish(payload: unknown, options?: PublishOptions): Promise<void> {
    const results = await Promise.allSettled(
      this.publishers.map((publisher) => publisher.publish(payload, options)),
    );

    const reasons = results.flatMap((result, index) => {
      if (result.status !== "rejected") return [];
      const reason = result.reason;
      return [`${index}: ${reason instanceof Error ? reason.message : String(reason)}`];
    });

    if (reasons.length > 0) {
      throw new Error(
        `${reasons.length} of ${results.length} publisher(s) failed: ${reasons.join("; ")}`,
      );
    }
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.publishers.map((publisher) => publisher.close()));
  }

  isReady(): boolean {
    return this.publishers.every((publisher) => publisher.isReady());
  }
}
