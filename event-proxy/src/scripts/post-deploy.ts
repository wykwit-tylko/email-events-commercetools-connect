import { loadSubscriptionConfig } from '../config/env.js';
import { CommercetoolsClient } from '../infra/commercetools-client.js';
import { upsertSubscription } from '../infra/subscription-manager.js';
import { errorFields, logger } from '../shared/logger.js';

async function run(): Promise<void> {
  const config = loadSubscriptionConfig();
  const client = new CommercetoolsClient(config);
  const result = await upsertSubscription({ config, client });

  logger.info('subscription post-deploy completed', {
    subscriptionKey: config.subscriptionKey,
    result,
    resourceTypeCount: config.messageResourceTypes.length,
    deliveryFormat: config.deliveryFormat,
  });
}

run().catch((error: unknown) => {
  logger.error('subscription post-deploy failed', errorFields(error));
  process.exitCode = 1;
});
