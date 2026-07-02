import { describe, expect, it } from "vitest";
import { StatsDurableObject } from "./stats-do";

describe("StatsDurableObject", () => {
  it("starts empty and increments atomically", async () => {
    const dobj = new StatsDurableObject(stateWith(new FakeStorage()), undefined);

    await expect(dobj.read()).resolves.toMatchObject({
      processed: 0,
      emailsSent: 0,
      dlq: 0,
    });

    await dobj.increment("processed");
    await dobj.increment("processed");
    await dobj.increment("emailsSent");

    await expect(dobj.read()).resolves.toMatchObject({
      processed: 2,
      emailsSent: 1,
    });
  });

  it("reads values persisted to storage across instances", async () => {
    // Two instances sharing one storage simulate the DO evicted and
    // re-instantiated: counters survive because they are persisted.
    const storage = new FakeStorage();
    const first = new StatsDurableObject(stateWith(storage), undefined);
    await first.increment("dlq");
    await first.increment("errors");

    const second = new StatsDurableObject(stateWith(storage), undefined);
    await expect(second.read()).resolves.toMatchObject({
      dlq: 1,
      errors: 1,
    });
  });
});

function stateWith(storage: FakeStorage): DurableObjectState {
  return { storage } as unknown as DurableObjectState;
}

class FakeStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
}
