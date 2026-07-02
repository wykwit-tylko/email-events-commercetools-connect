import { describe, expect, it } from "vitest";
import { mapLimit } from "./concurrency";

describe("mapLimit", () => {
  it("preserves order and returns every result", async () => {
    const input = [1, 2, 3, 4, 5];
    const out = await mapLimit(input, 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it("returns an empty array for empty input without calling fn", async () => {
    let calls = 0;
    const out = await mapLimit([], 5, async () => {
      calls += 1;
      return null;
    });
    expect(out).toEqual([]);
    expect(calls).toBe(0);
  });

  it("handles a limit larger than the number of items", async () => {
    const out = await mapLimit([1, 2], 100, async (n, i) => `${i}:${n}`);
    expect(out).toEqual(["0:1", "1:2"]);
  });

  it("never produces sparse results for a sub-1 limit", async () => {
    const out = await mapLimit([1, 2, 3], 0, async (n) => n + 1);
    expect(out).toEqual([2, 3, 4]);
    expect(out).toHaveLength(3);
  });

  it("rejects when any item rejects", async () => {
    await expect(
      mapLimit(
        [1, 2, 3],
        3,
        async (n) => (n === 2 ? Promise.reject(new Error("boom")) : n),
      ),
    ).rejects.toThrow("boom");
  });
});
