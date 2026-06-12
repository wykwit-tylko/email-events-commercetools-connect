type LogFields = Record<string, unknown>;

export type Logger = {
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

const SECRET_KEY_PATTERN = /token|secret|password/i;
const EMAIL_KEY_PATTERN = /email|^to$/i;

export const logger: Logger = {
  info(message, fields = {}) {
    console.log(serialize('info', message, fields));
  },
  warn(message, fields = {}) {
    console.warn(serialize('warn', message, fields));
  },
  error(message, fields = {}) {
    console.error(serialize('error', message, fields));
  },
};

function serialize(level: string, message: string, fields: LogFields): string {
  const sanitized = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, redactValue(key, value)]),
  );
  return JSON.stringify({ level, message, ...sanitized });
}

function redactValue(key: string, value: unknown): unknown {
  if (SECRET_KEY_PATTERN.test(key)) {
    return '[redacted]';
  }
  if (EMAIL_KEY_PATTERN.test(key) && typeof value === 'string') {
    return maskEmail(value);
  }
  return value;
}

/** `user@example.com` -> `u***@example.com`. */
function maskEmail(value: string): string {
  const at = value.indexOf('@');
  if (at <= 0) {
    return value;
  }
  return `${value[0]}***${value.slice(at)}`;
}

export function errorFields(error: unknown): LogFields {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
    };
  }
  return {
    errorMessage: String(error),
  };
}
