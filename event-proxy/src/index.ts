import { loadAppConfig, loadCtpConfig, type AppConfig } from './config/env.js';
import { InspectionStore } from './dev-inspection/inspection-store.js';
import { CloudflareQueuePublisher } from './infra/cloudflare-queue-publisher.js';
import type { CommerceNotificationPublisher } from './infra/commerce-notification-publisher.js';
import { CommercetoolsClient } from './infra/commercetools-client.js';
import { createApp } from './server/app.js';
import { logger } from './shared/logger.js';

async function main(): Promise<void> {
  const config = loadAppConfig();
  const ctpConfig = loadCtpConfig();
  const commercetoolsClient = ctpConfig ? new CommercetoolsClient(ctpConfig) : undefined;
  const publisher = createPublisher(config);
  const inspectionStore = config.devInspectionEnabled
    ? new InspectionStore(config.devInspectionMaxMessages)
    : undefined;

  logger.info('event proxy starting', {
    port: config.port,
    publisherType: config.publisherConfig.type,
    messageTypes: config.messageTypes,
    maxBodyBytes: config.maxBodyBytes,
    forwardingTimeoutMs: config.forwardingTimeoutMs,
    dryRunForwarding: config.dryRunForwarding,
    devInspectionEnabled: config.devInspectionEnabled,
  });

  const app = createApp({ config, publisher, logger, inspectionStore, commercetoolsClient });
  const server = app.listen(config.port, () => {
    logger.info('event proxy listening', { port: config.port });
  });

  const shutdown = async (): Promise<void> => {
    logger.info('event proxy shutting down');
    server.close();
    await publisher.close();
  };

  process.once('SIGINT', () => {
    void shutdown().then(() => process.exit(0));
  });
  process.once('SIGTERM', () => {
    void shutdown().then(() => process.exit(0));
  });
}

function createPublisher(config: AppConfig): CommerceNotificationPublisher {
  const publisherConfig = config.publisherConfig;

  switch (publisherConfig.type) {
    case 'cloudflare-queue':
      return new CloudflareQueuePublisher({
        accountId: publisherConfig.accountId,
        queueId: publisherConfig.queueId,
        apiToken: publisherConfig.apiToken,
        timeoutMs: config.forwardingTimeoutMs,
      });
  }
}

main().catch((error: unknown) => {
  logger.error('event proxy failed to start', {
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
