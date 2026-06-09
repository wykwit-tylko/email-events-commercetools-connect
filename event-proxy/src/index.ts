import { loadAppConfig } from './config/env.js';
import { createNatsPublisher } from './infra/nats-publisher.js';
import { createApp } from './server/app.js';
import { logger } from './shared/logger.js';

async function main(): Promise<void> {
  const config = loadAppConfig();
  const publisher = await createNatsPublisher({
    servers: config.natsUrl,
    token: config.natsAuthToken,
  });

  logger.info('event proxy starting', {
    port: config.port,
    natsUrl: config.natsUrl,
    natsSubject: config.natsSubject,
    maxBodyBytes: config.maxBodyBytes,
    natsPublishTimeoutMs: config.natsPublishTimeoutMs,
    natsAuthToken: '[redacted]',
  });

  const app = createApp({ config, publisher, logger });
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
