import { loadAppConfig } from './config/env.js';
import { InspectionStore } from './dev-inspection/inspection-store.js';
import { CloudflareQueuePublisher } from './infra/cloudflare-queue-publisher.js';
import { createApp } from './server/app.js';
import { logger } from './shared/logger.js';

async function main(): Promise<void> {
  const config = loadAppConfig();
  const publisher = new CloudflareQueuePublisher({
    accountId: config.cloudflareAccountId,
    queueId: config.cloudflareQueueId,
    apiToken: config.cloudflareApiToken,
    timeoutMs: config.forwardingTimeoutMs,
  });
  const inspectionStore = config.devInspectionEnabled
    ? new InspectionStore(config.devInspectionMaxMessages)
    : undefined;

  logger.info('event proxy starting', {
    port: config.port,
    cloudflareAccountId: config.cloudflareAccountId,
    cloudflareQueueId: config.cloudflareQueueId,
    maxBodyBytes: config.maxBodyBytes,
    forwardingTimeoutMs: config.forwardingTimeoutMs,
    dryRunForwarding: config.dryRunForwarding,
    devInspectionEnabled: config.devInspectionEnabled,
    cloudflareApiToken: '[redacted]',
  });

  const app = createApp({ config, publisher, logger, inspectionStore });
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

main().catch((error: unknown) => {
  logger.error('event proxy failed to start', {
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  process.exitCode = 1;
});
