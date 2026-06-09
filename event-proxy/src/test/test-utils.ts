import type { NatsPublisher, PublishOptions } from '../infra/nats-publisher.js';
import type { Logger } from '../shared/logger.js';

export class FakePublisher implements NatsPublisher {
  published: Array<{
    subject: string;
    payload: Buffer;
    options?: PublishOptions;
  }> = [];
  ready = true;
  error: Error | undefined;
  neverResolve = false;

  async publish(
    subject: string,
    payload: Uint8Array,
    options?: PublishOptions,
  ): Promise<void> {
    if (this.error) {
      throw this.error;
    }

    if (this.neverResolve) {
      await new Promise(() => undefined);
      return;
    }

    this.published.push({
      subject,
      payload: Buffer.from(payload),
      options,
    });
  }

  async close(): Promise<void> {
    return;
  }

  isReady(): boolean {
    return this.ready;
  }
}

export function createSilentLogger(): Logger & { entries: unknown[] } {
  const entries: unknown[] = [];

  return {
    entries,
    info(message, fields) {
      entries.push({ level: 'info', message, fields });
    },
    warn(message, fields) {
      entries.push({ level: 'warn', message, fields });
    },
    error(message, fields) {
      entries.push({ level: 'error', message, fields });
    },
  };
}
