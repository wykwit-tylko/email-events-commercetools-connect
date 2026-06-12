import { describe, expect, it } from 'vitest';
import { hmacSha256Hex } from './hmac';

describe('hmacSha256Hex', () => {
  it('matches the cross-repo vector shared with the storefront', async () => {
    // Same vector asserted in the storefront's server/orders/access.test.ts.
    await expect(hmacSha256Hex('test-secret', 'order-123')).resolves.toBe(
      'a939b9e03004fb78d801631c0d17acc8157c0900fdf25ee513fdb58b1a68d317',
    );
  });
});
