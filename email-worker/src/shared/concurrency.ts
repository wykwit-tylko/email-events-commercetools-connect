/**
 * Map over `items` with at most `limit` operations in flight, preserving order.
 *
 * Cloudflare caps subrequests per invocation (1000 paid / 50 free) and limits
 * concurrent subrequests, so dead-letter operations must fan out with a bound
 * rather than `Promise.all`-ing an unbounded page/backlog.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [] as R[];
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!, index);
    }
  };
  // At least one worker even for a nonsensical limit, so results never end up sparse.
  const workerCount = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
