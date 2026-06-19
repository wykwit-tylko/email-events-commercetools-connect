/**
 * Redacts sensitive fields from a Commerce Notification body before it is
 * persisted in the development inspection store:
 * - `value` fields on token notifications are replaced with '[redacted]'
 * - `customerEmail` / `email` fields are masked like 'u***@example.com'
 *
 * The input is deep-cloned; the original payload is never mutated.
 */
export function redactInspectionBody(body: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(body);
  const isTokenNotification = typeof clone.type === "string" && clone.type.includes("Token");

  redactInPlace(clone, isTokenNotification);

  return clone;
}

function redactInPlace(node: unknown, redactValueFields: boolean): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      redactInPlace(item, redactValueFields);
    }
    return;
  }

  if (node === null || typeof node !== "object") {
    return;
  }

  const record = node as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (redactValueFields && key === "value" && typeof value === "string") {
      record[key] = "[redacted]";
      continue;
    }

    if ((key === "customerEmail" || key === "email") && typeof value === "string") {
      record[key] = maskEmail(value);
      continue;
    }

    redactInPlace(value, redactValueFields);
  }
}

function maskEmail(email: string): string {
  const atIndex = email.indexOf("@");

  if (atIndex <= 0) {
    return "***";
  }

  return `${email[0]}***${email.slice(atIndex)}`;
}
