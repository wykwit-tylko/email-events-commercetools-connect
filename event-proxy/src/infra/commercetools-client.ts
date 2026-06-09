import type { CtpConfig, DeliveryFormat, SubscriptionConfig } from '../config/env.js';

export type Destination =
  | {
      type: 'GoogleCloudPubSub';
      projectId: string;
      topic: string;
    }
  | {
      type: 'SNS';
      topicArn: string;
      authenticationMode: 'IAM';
    };

export type MessageSubscription = {
  resourceTypeId: string;
};

export type Subscription = {
  id: string;
  version: number;
  key?: string;
  destination: Destination;
  messages: MessageSubscription[];
  changes: unknown[];
  events: unknown[];
  format?: { type: string; cloudEventsVersion?: string };
};

export type SubscriptionDraft = {
  key: string;
  destination: Destination;
  messages: MessageSubscription[];
  format: { type: string; cloudEventsVersion?: string };
};

export class CommercetoolsClient {
  private token: string | undefined;

  constructor(private readonly config: CtpConfig) {}

  async getSubscriptionByKey(key: string): Promise<Subscription | undefined> {
    const response = await this.request(`/subscriptions/key=${encodeURIComponent(key)}`);

    if (response.status === 404) {
      return undefined;
    }

    return this.parseJsonResponse<Subscription>(response);
  }

  async createSubscription(draft: SubscriptionDraft): Promise<Subscription> {
    const response = await this.request('/subscriptions', {
      method: 'POST',
      body: JSON.stringify(draft),
    });

    return this.parseJsonResponse<Subscription>(response);
  }

  async updateSubscription(options: {
    key: string;
    version: number;
    destination: Destination;
    messages: MessageSubscription[];
  }): Promise<Subscription> {
    const response = await this.request(
      `/subscriptions/key=${encodeURIComponent(options.key)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          version: options.version,
          actions: [
            {
              action: 'changeDestination',
              destination: options.destination,
            },
            {
              action: 'setMessages',
              messages: options.messages,
            },
          ],
        }),
      },
    );

    return this.parseJsonResponse<Subscription>(response);
  }

  async deleteSubscription(options: {
    key: string;
    version: number;
  }): Promise<void> {
    await this.request(
      `/subscriptions/key=${encodeURIComponent(options.key)}?version=${options.version}`,
      { method: 'DELETE' },
    );
  }

  async getCustomerById(id: string): Promise<{ email: string } | undefined> {
    const response = await this.request(`/customers/${encodeURIComponent(id)}`);

    if (response.status === 404) {
      return undefined;
    }

    const customer = await this.parseJsonResponse<{ email?: string }>(response);
    if (!customer.email) {
      return undefined;
    }

    return { email: customer.email };
  }

  private async request(
    path: string,
    options: RequestInit = {},
  ): Promise<Response> {
    const token = await this.getToken();
    const response = await fetch(
      `${this.config.ctpApiUrl}/${this.config.ctpProjectKey}${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(options.headers || {}),
        },
      },
    );

    if (!response.ok && response.status !== 404) {
      const body = await response.text();
      throw new Error(
        `commercetools API request failed with ${response.status}: ${body}`,
      );
    }

    return response;
  }

  private async getToken(): Promise<string> {
    if (this.token) {
      return this.token;
    }

    const credentials = Buffer.from(
      `${this.config.ctpClientId}:${this.config.ctpClientSecret}`,
    ).toString('base64');

    const response = await fetch(
      `${this.config.ctpAuthUrl}/oauth/token`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          scope: this.config.ctpScope,
        }),
      },
    );

    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `commercetools auth request failed with ${response.status}: ${body}`,
      );
    }

    const tokenResponse = (await response.json()) as { access_token?: string };
    if (!tokenResponse.access_token) {
      throw new Error('commercetools auth response did not contain access_token');
    }

    this.token = tokenResponse.access_token;
    return this.token;
  }

  private async parseJsonResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `commercetools API request failed with ${response.status}: ${body}`,
      );
    }

    return (await response.json()) as T;
  }
}

export function buildDestination(config: SubscriptionConfig): Destination {
  const destination = config.connectSubscriptionDestination || 'GoogleCloudPubSub';

  if (destination === 'GoogleCloudPubSub') {
    if (!config.connectGcpProjectId || !config.connectGcpTopicName) {
      throw new Error(
        'CONNECT_GCP_PROJECT_ID and CONNECT_GCP_TOPIC_NAME are required for GoogleCloudPubSub event deployments',
      );
    }

    return {
      type: 'GoogleCloudPubSub',
      projectId: config.connectGcpProjectId,
      topic: config.connectGcpTopicName,
    };
  }

  if (destination === 'SNS') {
    if (!config.connectAwsTopicArn) {
      throw new Error('CONNECT_AWS_TOPIC_ARN is required for SNS event deployments');
    }

    return {
      type: 'SNS',
      topicArn: config.connectAwsTopicArn,
      authenticationMode: 'IAM',
    };
  }

  throw new Error(`Unsupported CONNECT_SUBSCRIPTION_DESTINATION: ${destination}`);
}

export function buildFormat(deliveryFormat: DeliveryFormat): {
  type: string;
  cloudEventsVersion?: string;
} {
  if (deliveryFormat === 'CloudEvents') {
    return { type: 'CloudEvents', cloudEventsVersion: '1.0' };
  }

  return { type: 'Platform' };
}
