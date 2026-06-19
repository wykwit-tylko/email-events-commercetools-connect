const encoder = new TextEncoder();

/**
 * HMAC-SHA256 lowercase hex digest via WebCrypto.
 *
 * Produces identical output to Node's `createHmac("sha256", secret).update(message).digest("hex")`,
 * which is what the shelfmarket receiver uses to verify Email Event deliveries.
 * The known-answer vector in `hmac.test.ts` pins this cross-runtime contract.
 */
export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return toHex(signature);
}

/**
 * SHA-256 lowercase hex digest. Used to derive a stable delivery id when a
 * Commerce Notification carries no usable `id`, so identical retries still
 * dedupe on the receiver.
 */
export async function sha256Hex(message: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(message));
  return toHex(digest);
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
