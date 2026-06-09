export type Logger = {
  info: (message: string, fields?: Record<string, unknown>) => void;
  warn: (message: string, fields?: Record<string, unknown>) => void;
  error: (message: string, fields?: Record<string, unknown>) => void;
};

export const logger: Logger = {
  info(message, fields = {}) {
    console.log(JSON.stringify({ level: 'info', message, ...fields }));
  },
  warn(message, fields = {}) {
    console.warn(JSON.stringify({ level: 'warn', message, ...fields }));
  },
  error(message, fields = {}) {
    console.error(JSON.stringify({ level: 'error', message, ...fields }));
  },
};

export function errorFields(error: unknown): Record<string, unknown> {
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
