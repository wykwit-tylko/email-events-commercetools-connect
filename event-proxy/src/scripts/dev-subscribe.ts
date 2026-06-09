import { connect } from '@nats-io/transport-node';
import { loadAppConfig } from '../config/env.js';
import { errorFields, logger } from '../shared/logger.js';

async function run(): Promise<void> {
  const config = loadAppConfig();
  const connection = await connect({
    servers: config.natsUrl,
    token: config.natsAuthToken,
  });
  const subscription = connection.subscribe(config.natsSubject);

  logger.info('dev subscriber listening', {
    natsUrl: config.natsUrl,
    natsSubject: config.natsSubject,
    natsAuthToken: '[redacted]',
  });

  for await (const message of subscription) {
    process.stdout.write(`${message.data.toString()}\n`);
  }
}

run().catch((error: unknown) => {
  logger.error('dev subscriber failed', errorFields(error));
  process.exitCode = 1;
});
