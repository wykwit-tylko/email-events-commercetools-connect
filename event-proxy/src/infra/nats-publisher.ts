import {
  connect,
  headers,
  type NatsConnection,
} from '@nats-io/transport-node';

export type PublishOptions = {
  contentType?: string;
};

export type NatsPublisher = {
  publish: (
    subject: string,
    payload: Uint8Array,
    options?: PublishOptions,
  ) => Promise<void>;
  close: () => Promise<void>;
  isReady: () => boolean;
};

export async function createNatsPublisher(options: {
  servers: string;
  token: string;
}): Promise<NatsPublisher> {
  const connection = await connect({
    servers: options.servers,
    token: options.token,
    reconnect: true,
  });

  return new NatsConnectionPublisher(connection);
}

class NatsConnectionPublisher implements NatsPublisher {
  constructor(private readonly connection: NatsConnection) {}

  async publish(
    subject: string,
    payload: Uint8Array,
    options: PublishOptions = {},
  ): Promise<void> {
    const messageHeaders = headers();

    if (options.contentType) {
      messageHeaders.set('Content-Type', options.contentType);
    }

    this.connection.publish(subject, payload, { headers: messageHeaders });
    await this.connection.flush();
  }

  async close(): Promise<void> {
    await this.connection.drain();
  }

  isReady(): boolean {
    return !this.connection.isClosed();
  }
}
