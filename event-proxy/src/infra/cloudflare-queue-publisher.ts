import type {
  CommerceNotificationPublisher,
  PublishOptions,
} from "./commerce-notification-publisher.js";

export class CloudflareQueuePublisher implements CommerceNotificationPublisher {
  private readonly endpointUrl: string;

  constructor(
    private readonly options: {
      accountId: string;
      queueId: string;
      apiToken: string;
      timeoutMs: number;
    },
  ) {
    this.endpointUrl = `https://api.cloudflare.com/client/v4/accounts/${options.accountId}/queues/${options.queueId}/messages`;
  }

  async publish(payload: unknown, _options: PublishOptions = {}): Promise<void> {
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), this.options.timeoutMs);

    try {
      const response = await fetch(this.endpointUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content_type: "json",
          body: payload,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const responseBody = await response.text();
        throw new Error(`Cloudflare Queue publish failed with ${response.status}: ${responseBody}`);
      }

      const result = (await response.json()) as { success?: boolean };
      if (result.success !== true) {
        throw new Error("Cloudflare Queue publish response did not indicate success");
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async close(): Promise<void> {
    return;
  }

  isReady(): boolean {
    return true;
  }
}
