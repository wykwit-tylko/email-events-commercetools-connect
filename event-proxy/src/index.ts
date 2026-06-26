import {
  loadAppConfig,
  loadCtpConfig,
  type AppConfig,
  type PublisherConfig,
} from "./config/env.js";
import { InspectionStore } from "./dev-inspection/inspection-store.js";
import { CloudflareQueuePublisher } from "./infra/cloudflare-queue-publisher.js";
import { CompositePublisher } from "./infra/composite-publisher.js";
import { HttpWebhookPublisher } from "./infra/http-webhook-publisher.js";
import type { CommerceNotificationPublisher } from "./infra/commerce-notification-publisher.js";
import { CommercetoolsClient } from "./infra/commercetools-client.js";
import { createApp } from "./server/app.js";
import { logger } from "./shared/logger.js";

async function main(): Promise<void> {
  const config = loadAppConfig();
  const ctpConfig = loadCtpConfig();
  const commercetoolsClient = ctpConfig ? new CommercetoolsClient(ctpConfig) : undefined;
  const publisher = createPublisher(config);
  const inspectionStore = config.devInspectionEnabled
    ? new InspectionStore(config.devInspectionMaxMessages)
    : undefined;

  logger.info("event proxy starting", {
    port: config.port,
    publisherTypes: config.publisherConfigs.map((publisher) => publisher.type),
    messageTypes: config.messageTypes,
    maxBodyBytes: config.maxBodyBytes,
    forwardingTimeoutMs: config.forwardingTimeoutMs,
    dryRunForwarding: config.dryRunForwarding,
    devInspectionEnabled: config.devInspectionEnabled,
  });

  const app = createApp({ config, publisher, logger, inspectionStore, commercetoolsClient });
  const server = app.listen(config.port, () => {
    logger.info("event proxy listening", { port: config.port });
  });

  const shutdown = async (): Promise<void> => {
    logger.info("event proxy shutting down");
    server.close();
    await publisher.close();
  };

  process.once("SIGINT", () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().then(() => process.exit(0));
  });
}

function createPublisher(config: AppConfig): CommerceNotificationPublisher {
  const publishers = config.publisherConfigs.map((publisherConfig) =>
    createSinglePublisher(publisherConfig, config.forwardingTimeoutMs),
  );

  if (publishers.length === 1) {
    return publishers[0];
  }

  return new CompositePublisher(publishers, logger);
}

function createSinglePublisher(
  publisherConfig: PublisherConfig,
  timeoutMs: number,
): CommerceNotificationPublisher {
  switch (publisherConfig.type) {
    case "cloudflare-queue":
      return new CloudflareQueuePublisher({
        accountId: publisherConfig.accountId,
        queueId: publisherConfig.queueId,
        apiToken: publisherConfig.apiToken,
        timeoutMs,
      });
    case "http-webhook":
      return new HttpWebhookPublisher({
        endpointUrl: publisherConfig.endpointUrl,
        emailEventSecret: publisherConfig.emailEventSecret,
        timeoutMs,
      });
  }
}

main().catch((error: unknown) => {
  logger.error("event proxy failed to start", {
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
