import type {
  CommerceNotificationPublisher,
  PublishOptions,
} from "../infra/commerce-notification-publisher.js";
import type { Logger } from "../shared/logger.js";

export class FakePublisher implements CommerceNotificationPublisher {
  published: Array<{
    payload: unknown;
    options?: PublishOptions;
  }> = [];
  ready = true;
  error: Error | undefined;
  neverResolve = false;
  delayUntil: Promise<void> | undefined;

  async publish(payload: unknown, options?: PublishOptions): Promise<void> {
    if (this.error) {
      throw this.error;
    }

    if (this.neverResolve) {
      await new Promise(() => undefined);
      return;
    }

    if (this.delayUntil) {
      await this.delayUntil;
    }

    this.published.push({
      payload,
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
      entries.push({ level: "info", message, fields });
    },
    warn(message, fields) {
      entries.push({ level: "warn", message, fields });
    },
    error(message, fields) {
      entries.push({ level: "error", message, fields });
    },
  };
}

export function createDeferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function flushAsyncWork(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve));
}
