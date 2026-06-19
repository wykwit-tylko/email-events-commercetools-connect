import type { Request } from "express";

export class PayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Request body exceeds MAX_BODY_BYTES (${limit})`);
    this.name = "PayloadTooLargeError";
  }
}

export async function readRawBody(request: Request, maxBodyBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += buffer.length;

    if (bytes > maxBodyBytes) {
      throw new PayloadTooLargeError(maxBodyBytes);
    }

    chunks.push(buffer);
  }

  return Buffer.concat(chunks, bytes);
}
