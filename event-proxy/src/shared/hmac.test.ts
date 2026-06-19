import { describe, expect, it } from "vitest";
import { hmacSha256Hex, sha256Hex } from "./hmac";

describe("hmacSha256Hex", () => {
  // Shared contract with Node's createHmac and the email worker's hmacSha256Hex.
  it("matches the known-answer vector", async () => {
    await expect(hmacSha256Hex("test-secret", "order-123")).resolves.toBe(
      "a939b9e03004fb78d801631c0d17acc8157c0900fdf25ee513fdb58b1a68d317",
    );
  });

  it("produces a deterministic 64-char hex digest", async () => {
    const digest = await hmacSha256Hex("secret", "message");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    await expect(hmacSha256Hex("secret", "message")).resolves.toBe(digest);
  });
});

describe("sha256Hex", () => {
  it("produces a deterministic 64-char hex digest", async () => {
    const digest = await sha256Hex("message");
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    await expect(sha256Hex("message")).resolves.toBe(digest);
  });
});
