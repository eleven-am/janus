type LogLevel = "error" | "warn" | "info" | "debug";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  code: string;
  context?: LogContext;
}

function formatError(error: unknown): object {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: String(error) };
}

function createLogEntry(
  level: LogLevel,
  code: string,
  context?: LogContext
): LogEntry {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    code,
  };

  if (context) {
    const processedContext: LogContext = {};
    for (const [key, value] of Object.entries(context)) {
      if (key === "error" && value) {
        processedContext.error = formatError(value);
      } else {
        processedContext[key] = value;
      }
    }
    entry.context = processedContext;
  }

  return entry;
}

function output(entry: LogEntry): void {
  const json = JSON.stringify(entry);
  if (entry.level === "error") {
    process.stderr.write(json + "\n");
  } else {
    process.stdout.write(json + "\n");
  }
}

export function logError(code: string, context?: LogContext): void {
  output(createLogEntry("error", code, context));
}

export function logWarn(code: string, context?: LogContext): void {
  output(createLogEntry("warn", code, context));
}

export function logInfo(code: string, context?: LogContext): void {
  output(createLogEntry("info", code, context));
}

export function logEvent(code: string, context?: LogContext): void {
  output(createLogEntry("info", code, context));
}

export function logDebug(code: string, context?: LogContext): void {
  output(createLogEntry("debug", code, context));
}
