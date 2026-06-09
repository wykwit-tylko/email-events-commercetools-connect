export type ExtractedBody = {
  body: Buffer;
  contentType?: string;
};

export class DecodedPayloadTooLargeError extends Error {
  constructor(limit: number) {
    super(`Decoded Commerce Notification exceeds MAX_BODY_BYTES (${limit})`);
    this.name = 'DecodedPayloadTooLargeError';
  }
}

export function extractCommerceNotificationBody(options: {
  rawBody: Buffer;
  contentType?: string;
  connectSubscriptionDestination?: string;
  maxBodyBytes: number;
}): ExtractedBody {
  const destination = options.connectSubscriptionDestination;

  if (destination === 'GoogleCloudPubSub') {
    return decodeGoogleCloudPubSubEnvelope(options);
  }

  if (destination === 'SNS') {
    return decodeSnsEnvelope(options);
  }

  const pubSubBody = tryDecodeGoogleCloudPubSubEnvelope(options);
  if (pubSubBody) {
    return pubSubBody;
  }

  const snsBody = tryDecodeSnsEnvelope(options);
  if (snsBody) {
    return snsBody;
  }

  return {
    body: options.rawBody,
    contentType: options.contentType,
  };
}

function decodeGoogleCloudPubSubEnvelope(options: {
  rawBody: Buffer;
  maxBodyBytes: number;
}): ExtractedBody {
  const decoded = tryDecodeGoogleCloudPubSubEnvelope(options);
  if (!decoded) {
    throw new Error('Expected Google Cloud Pub/Sub push envelope');
  }
  return decoded;
}

function tryDecodeGoogleCloudPubSubEnvelope(options: {
  rawBody: Buffer;
  maxBodyBytes: number;
}): ExtractedBody | undefined {
  const envelope = parseJsonObject(options.rawBody);
  const data = envelope?.message?.data;

  if (typeof data !== 'string') {
    return undefined;
  }

  const body = Buffer.from(data, 'base64');
  assertDecodedBodySize(body, options.maxBodyBytes);

  return {
    body,
    contentType: 'application/json',
  };
}

function decodeSnsEnvelope(options: {
  rawBody: Buffer;
  maxBodyBytes: number;
}): ExtractedBody {
  const decoded = tryDecodeSnsEnvelope(options);
  if (!decoded) {
    throw new Error('Expected AWS SNS envelope');
  }
  return decoded;
}

function tryDecodeSnsEnvelope(options: {
  rawBody: Buffer;
  maxBodyBytes: number;
}): ExtractedBody | undefined {
  const envelope = parseJsonObject(options.rawBody);
  const message = envelope?.Message;

  if (typeof message !== 'string') {
    return undefined;
  }

  const body = Buffer.from(message);
  assertDecodedBodySize(body, options.maxBodyBytes);

  return {
    body,
    contentType: 'application/json',
  };
}

function parseJsonObject(body: Buffer): any | undefined {
  try {
    const parsed = JSON.parse(body.toString('utf8'));
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function assertDecodedBodySize(body: Buffer, maxBodyBytes: number): void {
  if (body.length > maxBodyBytes) {
    throw new DecodedPayloadTooLargeError(maxBodyBytes);
  }
}
