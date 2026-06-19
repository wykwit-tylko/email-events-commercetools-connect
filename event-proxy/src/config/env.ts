export const DEFAULT_MESSAGE_RESOURCE_TYPES = [
  "approval-flow",
  "approval-rule",
  "associate-role",
  "business-unit",
  "category",
  "customer",
  "customer-email-token",
  "customer-group",
  "customer-password-token",
  "inventory-entry",
  "order",
  "payment",
  "product",
  "product-selection",
  "product-tailoring",
  "quote",
  "quote-request",
  "review",
  "shopping-list",
  "staged-quote",
  "standalone-price",
  "store",
] as const;

export type DeliveryFormat = "Platform" | "CloudEvents";

export type CloudflareQueuePublisherConfig = {
  type: "cloudflare-queue";
  accountId: string;
  queueId: string;
  apiToken: string;
};

export type HttpWebhookPublisherConfig = {
  type: "http-webhook";
  endpointUrl: string;
  /** Shared emails-specific secret used to sign Email Event deliveries. */
  emailEventSecret: string;
};

export type PublisherConfig = CloudflareQueuePublisherConfig | HttpWebhookPublisherConfig;

export type AppConfig = {
  port: number;
  publisherConfigs: PublisherConfig[];
  messageTypes: string[];
  maxBodyBytes: number;
  forwardingTimeoutMs: number;
  dryRunForwarding: boolean;
  devInspectionEnabled: boolean;
  devInspectionMaxMessages: number;
  devInspectionToken?: string;
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

const defaultSubscriptionKey = "email-events-proxy";

/**
 * Decode a value if it was base64-encoded by the deploy script to avoid
 * comma-splitting issues in the commercetools CLI.
 * Values prefixed with `b64:` are decoded; all others pass through unchanged.
 * Also strips surrounding quotes that the deployment system may add.
 */
function maybeBase64Decode(value: string | undefined): string | undefined {
  if (!value) {
    return value;
  }

  // The deployment system sometimes wraps string values in quotes.
  let cleaned = value;
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1);
  }

  if (!cleaned.startsWith("b64:")) {
    return cleaned;
  }

  const encoded = cleaned.slice(4);
  try {
    return Buffer.from(encoded, "base64").toString("utf8");
  } catch {
    return cleaned;
  }
}

export function loadAppConfig(env: Env = process.env): AppConfig {
  return {
    port: parsePositiveInteger(env.PORT, 8080, "PORT"),
    publisherConfigs: parsePublisherConfigs(maybeBase64Decode(env.OUTBOUND_PUBLISHER_CONFIG)),
    messageTypes: parseMessageTypes(maybeBase64Decode(env.CT_MESSAGE_TYPES)),
    maxBodyBytes: parsePositiveInteger(env.MAX_BODY_BYTES, 90_000, "MAX_BODY_BYTES"),
    forwardingTimeoutMs: parsePositiveInteger(
      env.FORWARDING_TIMEOUT_MS,
      2_000,
      "FORWARDING_TIMEOUT_MS",
    ),
    dryRunForwarding: parseBoolean(env.DRY_RUN_FORWARDING, false),
    devInspectionEnabled: parseBoolean(env.DEV_INSPECTION_ENABLED, false),
    devInspectionMaxMessages: parsePositiveInteger(
      env.DEV_INSPECTION_MAX_MESSAGES,
      100,
      "DEV_INSPECTION_MAX_MESSAGES",
    ),
    devInspectionToken: env.DEV_INSPECTION_TOKEN || undefined,
    connectSubscriptionDestination: env.CONNECT_SUBSCRIPTION_DESTINATION,
  };
}

export function loadCtpConfig(env: Env = process.env): CtpConfig | undefined {
  const region = env.CTP_REGION;
  const projectKey = env.CTP_PROJECT_KEY;
  const clientId = env.CTP_CLIENT_ID;
  const clientSecret = env.CTP_CLIENT_SECRET;
  const scope = env.CTP_SCOPE;

  if (!region || !projectKey || !clientId || !clientSecret || !scope) {
    return undefined;
  }

  return {
    ctpApiUrl: env.CTP_API_URL || apiUrlFromRegion(region),
    ctpAuthUrl: env.CTP_AUTH_URL || authUrlFromRegion(region),
    ctpProjectKey: projectKey,
    ctpClientId: clientId,
    ctpClientSecret: clientSecret,
    ctpScope: scope,
  };
}

export function loadSubscriptionConfig(env: Env = process.env): SubscriptionConfig {
  const ctpConfig = loadCtpConfig(env);
  if (!ctpConfig) {
    throw new Error(
      "CTP credentials are required for subscription management. " +
        "Provide CTP_REGION, CTP_PROJECT_KEY, CTP_CLIENT_ID, CTP_CLIENT_SECRET, and CTP_SCOPE.",
    );
  }

  return {
    ...ctpConfig,
    subscriptionKey: env.CT_SUBSCRIPTION_KEY || defaultSubscriptionKey,
    messageResourceTypes: parseMessageResourceTypes(
      maybeBase64Decode(env.CT_MESSAGE_RESOURCE_TYPES),
    ),
    deliveryFormat: "Platform",
    connectSubscriptionDestination: env.CONNECT_SUBSCRIPTION_DESTINATION,
    connectGcpProjectId: env.CONNECT_GCP_PROJECT_ID,
    connectGcpTopicName: env.CONNECT_GCP_TOPIC_NAME,
    connectAwsTopicArn: env.CONNECT_AWS_TOPIC_ARN,
  };
}

export function parseMessageResourceTypes(value: string | undefined): string[] {
  const resourceTypes = parseCommaSeparatedList(value || DEFAULT_MESSAGE_RESOURCE_TYPES.join(","));

  if (resourceTypes.length === 0) {
    throw new Error("CT_MESSAGE_RESOURCE_TYPES must contain at least one value");
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
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function parsePublisherConfigs(value: string | undefined): PublisherConfig[] {
  if (!value) {
    throw new Error("OUTBOUND_PUBLISHER_CONFIG is required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    const display = value.length > 120 ? `${value.slice(0, 120)}...` : value;
    throw new Error(`OUTBOUND_PUBLISHER_CONFIG must be valid JSON. Received: ${display}`);
  }

  let entries: unknown[];
  if (Array.isArray(parsed)) {
    if (parsed.length === 0) {
      throw new Error("OUTBOUND_PUBLISHER_CONFIG array must contain at least one publisher");
    }
    entries = parsed;
  } else if (parsed && typeof parsed === "object") {
    entries = [parsed];
  } else {
    throw new Error("OUTBOUND_PUBLISHER_CONFIG must be a JSON object or an array of objects");
  }

  return entries.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`OUTBOUND_PUBLISHER_CONFIG[${index}] must be an object`);
    }
    return parsePublisherEntry(entry as Record<string, unknown>, index);
  });
}

function parsePublisherEntry(config: Record<string, unknown>, index: number): PublisherConfig {
  const path = `OUTBOUND_PUBLISHER_CONFIG[${index}]`;

  if (config.type === "cloudflare-queue") {
    return {
      type: "cloudflare-queue",
      accountId: requireStringConfig(config, "accountId", path),
      queueId: requireStringConfig(config, "queueId", path),
      apiToken: requireStringConfig(config, "apiToken", path),
    };
  }

  if (config.type === "http-webhook") {
    return {
      type: "http-webhook",
      endpointUrl: requireStringConfig(config, "endpointUrl", path),
      emailEventSecret: requireStringConfig(config, "emailEventSecret", path),
    };
  }

  throw new Error(`${path}.type must be cloudflare-queue or http-webhook`);
}

function requireStringConfig(config: Record<string, unknown>, key: string, path: string): string {
  const value = config[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path}.${key} is required`);
  }
  return value;
}

function apiUrlFromRegion(region: string): string {
  return `https://api.${region}.commercetools.com`;
}

function authUrlFromRegion(region: string): string {
  return `https://auth.${region}.commercetools.com`;
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

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error("Boolean environment values must be true or false");
}
