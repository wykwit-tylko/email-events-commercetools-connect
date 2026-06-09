type LogFields = Record<string, unknown>;

export type Logger = {
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
};

export const logger: Logger = {
  info(message, fields = {}) {
    writeLog('info', message, fields);
  },
  warn(message, fields = {}) {
    writeLog('warn', message, fields);
  },
  error(message, fields = {}) {
    writeLog('error', message, fields);
  },
};

function writeLog(level: string, message: string, fields: LogFields): void {
  const sanitizedFields = redact(fields);
  process.stdout.write(
    `${JSON.stringify({ level, message, ...sanitizedFields })}\n`,
  );
}

function redact(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      /token|secret|password/i.test(key) ? '[redacted]' : value,
    ]),
  );
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
