import type {
  CommerceNotificationPublisher,
  PublishOptions,
} from "./commerce-notification-publisher.js";
import type { Logger } from "../shared/logger.js";

/**
 * Fans a Commerce Notification out to every configured Outbound Publisher in
 * parallel. The call resolves as soon as ANY publisher succeeds — one
 * successful delivery is enough to acknowledge commercetools, which avoids
 * redriving the durable publishers (and the email worker's dedupe) every time
 * a fragile publisher (for example an HTTP webhook) is slow or down.
 *
 * The call rejects only when EVERY publisher fails, so commercetools redelivers
 * only when no delivery happened at all. Each individual publisher failure is
 * logged at warn level so a degraded publisher is never silenced.
 *
 * Every consumer must still be idempotent: a slow publisher can still succeed
 * in the background after the composite has already resolved on another
 * publisher's success.
 */
export class CompositePublisher implements CommerceNotificationPublisher {
  constructor(
    private readonly publishers: ReadonlyArray<CommerceNotificationPublisher>,
    private readonly logger: Logger,
  ) {
    if (publishers.length === 0) {
      throw new Error("CompositePublisher requires at least one publisher");
    }
  }

  async publish(payload: unknown, options?: PublishOptions): Promise<void> {
    if (this.publishers.length === 1) {
      return this.publishers[0].publish(payload, options);
    }

    await new Promise<void>((resolve, reject) => {
      let failed = 0;
      let done = false;
      const failureReasons: Array<{ index: number; reason: string }> = [];

      this.publishers.forEach((publisher, index) => {
        let attempt: Promise<void>;
        try {
          attempt = publisher.publish(payload, options);
        } catch (error) {
          attempt = Promise.reject(error);
        }

        attempt
          .then(() => {
            if (!done) {
              done = true;
              if (failureReasons.length > 0) {
                this.logger.info("commerce notification partially forwarded", {
                  successfulPublisherIndex: index,
                  failedPublishers: [...failureReasons],
                });
              }
              resolve();
            }
          })
          .catch((error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            failureReasons.push({ index, reason });
            this.logger.warn("outbound publisher failed", {
              publisherIndex: index,
              publisherCount: this.publishers.length,
              reason,
            });

            failed += 1;
            if (failed === this.publishers.length && !done) {
              done = true;
              reject(
                new Error(
                  `all ${this.publishers.length} outbound publishers failed: ${failureReasons
                    .slice()
                    .sort((a, b) => a.index - b.index)
                    .map(({ index, reason }) => `${index}: ${reason}`)
                    .join("; ")}`,
                ),
              );
            }
          });
      });
    });
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.publishers.map((publisher) => publisher.close()));
  }

  isReady(): boolean {
    return this.publishers.every((publisher) => publisher.isReady());
  }
}
