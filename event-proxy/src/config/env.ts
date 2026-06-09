export const DEFAULT_MESSAGE_RESOURCE_TYPES = [
  'approval-flow',
  'approval-rule',
  'associate-role',
  'business-unit',
  'category',
  'customer',
  'customer-email-token',
  'customer-group',
  'customer-password-token',
  'inventory-entry',
  'order',
  'payment',
  'product',
  'product-selection',
  'product-tailoring',
  'quote',
  'quote-request',
  'review',
  'shopping-list',
  'staged-quote',
  'standalone-price',
  'store',
] as const;

export type DeliveryFormat = 'Platform' | 'CloudEvents';

export type PublisherConfig = {
  type: 'cloudflare-queue';
  accountId: string;
  queueId: string;
  apiToken: string;
};

export type AppConfig = {
  port: number;
  publisherConfig: PublisherConfig;
  messageTypes: string[];
  maxBodyBytes: number;
  forwardingTimeoutMs: number;
  dryRunForwarding: boolean;
  devInspectionEnabled: boolean;
  devInspectionMaxMessages: number;
  connectSubscriptionDestination?: string;
};

export type CtpConfig = {
  ctpApiUrl: string;
  ctpAuthUrl: string;
  ctpProjectKey: string;
  ctpClientId: string;
  ctpClientSecret: string;
  ctpScope: string;
};

export type SubscriptionConfig = CtpConfig & {
  subscriptionKey: string;
  messageResourceTypes: string[];
  deliveryFormat: DeliveryFormat;
  connectSubscriptionDestination?: string;
  connectGcpProjectId?: string;
  connectGcpTopicName?: string;
  connectAwsTopicArn?: string;
};

type Env = Record<string, string | undefined>;

const defaultSubscriptionKey = 'email-events-proxy';

export function loadAppConfig(env: Env = process.env): AppConfig {
  return {
    port: parsePositiveInteger(env.PORT, 8080, 'PORT'),
    publisherConfig: parsePublisherConfig(env.OUTBOUND_PUBLISHER_CONFIG),
    messageTypes: parseMessageTypes(env.CT_MESSAGE_TYPES),
    maxBodyBytes: parsePositiveInteger(
      env.MAX_BODY_BYTES,
      90_000,
      'MAX_BODY_BYTES',
    ),
    forwardingTimeoutMs: parsePositiveInteger(
      env.FORWARDING_TIMEOUT_MS,
      2_000,
      'FORWARDING_TIMEOUT_MS',
    ),
    dryRunForwarding: parseBoolean(env.DRY_RUN_FORWARDING, false),
    devInspectionEnabled: parseBoolean(env.DEV_INSPECTION_ENABLED, false),
    devInspectionMaxMessages: parsePositiveInteger(
      env.DEV_INSPECTION_MAX_MESSAGES,
      100,
      'DEV_INSPECTION_MAX_MESSAGES',
    ),
    connectSubscriptionDestination: env.CONNECT_SUBSCRIPTION_DESTINATION,
  };
}

export function loadCtpConfig(env: Env = process.env): CtpConfig {
  return {
    ctpApiUrl: env.CTP_API_URL || apiUrlFromRegion(requireEnv(env, 'CTP_REGION')),
    ctpAuthUrl: env.CTP_AUTH_URL || authUrlFromRegion(requireEnv(env, 'CTP_REGION')),
    ctpProjectKey: requireEnv(env, 'CTP_PROJECT_KEY'),
    ctpClientId: requireEnv(env, 'CTP_CLIENT_ID'),
    ctpClientSecret: requireEnv(env, 'CTP_CLIENT_SECRET'),
    ctpScope: requireEnv(env, 'CTP_SCOPE'),
  };
}

export function loadSubscriptionConfig(
  env: Env = process.env,
): SubscriptionConfig {
  return {
    ...loadCtpConfig(env),
    subscriptionKey: env.CT_SUBSCRIPTION_KEY || defaultSubscriptionKey,
    messageResourceTypes: parseMessageResourceTypes(env.CT_MESSAGE_RESOURCE_TYPES),
    deliveryFormat: 'Platform',
    connectSubscriptionDestination: env.CONNECT_SUBSCRIPTION_DESTINATION,
    connectGcpProjectId: env.CONNECT_GCP_PROJECT_ID,
    connectGcpTopicName: env.CONNECT_GCP_TOPIC_NAME,
    connectAwsTopicArn: env.CONNECT_AWS_TOPIC_ARN,
  };
}

export function parseMessageResourceTypes(value: string | undefined): string[] {
  const resourceTypes = parseCommaSeparatedList(
    value || DEFAULT_MESSAGE_RESOURCE_TYPES.join(','),
  );

  if (resourceTypes.length === 0) {
    throw new Error('CT_MESSAGE_RESOURCE_TYPES must contain at least one value');
  }

  return resourceTypes;
}

export function parseMessageTypes(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return parseCommaSeparatedList(value);
}

function parseCommaSeparatedList(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parsePublisherConfig(value: string | undefined): PublisherConfig {
  if (!value) {
    throw new Error('OUTBOUND_PUBLISHER_CONFIG is required');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error('OUTBOUND_PUBLISHER_CONFIG must be valid JSON');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OUTBOUND_PUBLISHER_CONFIG must be a JSON object');
  }

  const config = parsed as Record<string, unknown>;
  if (config.type !== 'cloudflare-queue') {
    throw new Error('OUTBOUND_PUBLISHER_CONFIG type must be cloudflare-queue');
  }

  return {
    type: 'cloudflare-queue',
    accountId: requireStringConfig(config, 'accountId'),
    queueId: requireStringConfig(config, 'queueId'),
    apiToken: requireStringConfig(config, 'apiToken'),
  };
}

function requireStringConfig(config: Record<string, unknown>, key: string): string {
  const value = config[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`OUTBOUND_PUBLISHER_CONFIG.${key} is required`);
  }
  return value;
}

function parseDeliveryFormat(value: string | undefined): DeliveryFormat {
  if (!value || value === 'Platform') {
    return 'Platform';
  }

  if (value === 'CloudEvents') {
    return 'CloudEvents';
  }

  throw new Error('CT_DELIVERY_FORMAT must be either Platform or CloudEvents');
}

function apiUrlFromRegion(region: string): string {
  return `https://api.${region}.commercetools.com`;
}

function authUrlFromRegion(region: string): string {
  return `https://auth.${region}.commercetools.com`;
}

function requireEnv(env: Env, key: string): string {
  const value = env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

function parsePositiveInteger(
  value: string | undefined,
  defaultValue: number,
  name: string,
): number {
  if (!value) {
    return defaultValue;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }

  return parsed;
}

function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) {
    return defaultValue;
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  throw new Error('Boolean environment values must be true or false');
}
