/**
 * HMAC-SHA256 hex digest via WebCrypto.
 *
 * Shared contract with the storefront's server/orders/access.ts: both sides
 * must produce identical keys for the same secret and message so guest order
 * links minted here validate there.
 */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
