import { loadSubscriptionConfig } from '../config/env.js';
import { CommercetoolsClient } from '../infra/commercetools-client.js';
import { deleteSubscription } from '../infra/subscription-manager.js';
import { errorFields, logger } from '../shared/logger.js';

async function run(): Promise<void> {
  const config = loadSubscriptionConfig();
  const client = new CommercetoolsClient(config);
  const result = await deleteSubscription({ config, client });

  logger.info('subscription pre-undeploy completed', {
    subscriptionKey: config.subscriptionKey,
    result,
  });
}

run().catch((error: unknown) => {
  logger.error('subscription pre-undeploy failed', errorFields(error));
  process.exitCode = 1;
});
