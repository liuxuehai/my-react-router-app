import type { Context, Next } from "hono";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LoggerOptions {
  level?: LogLevel;
  enabled?: boolean;
  includeRequestBody?: boolean;
  includeResponseBody?: boolean;
  maxBodyLength?: number;
}

interface LogEntry {
  timestamp: string;
  method: string;
  url: string;
  userAgent?: string;
  ip?: string;
  requestId?: string;
  duration?: number;
  status?: number;
  requestBody?: any;
  responseBody?: any;
  error?: string;
}

const defaultOptions: LoggerOptions = {
  level: "info",
  enabled: true,
  includeRequestBody: false,
  includeResponseBody: false,
  maxBodyLength: 1000,
};

const logLevels: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export function logger(options: LoggerOptions = {}) {
  const opts = { ...defaultOptions, ...options };

  if (!opts.enabled) {
    return async (c: Context, next: Next) => {
      await next();
    };
  }

  return async (c: Context, next: Next) => {
    const startTime = Date.now();
    const requestId = generateRequestId();

    // Set request ID in context for other middleware to use
    c.set("requestId", requestId);

    const logEntry: LogEntry = {
      timestamp: new Date().toISOString(),
      method: c.req.method,
      url: c.req.url,
      userAgent: c.req.header("User-Agent"),
      ip: getClientIP(c),
      requestId,
    };

    // Log request body if enabled
    if (opts.includeRequestBody && shouldLogBody(c.req.method)) {
      try {
        // Use Hono's body parsing which caches the result
        const body = await c.req.text();
        logEntry.requestBody = truncateBody(body, opts.maxBodyLength);
      } catch (error) {
        logEntry.requestBody = "[Failed to read request body]";
      }
    }

    let error: Error | null = null;

    try {
      await next();
    } catch (err) {
      error = err as Error;
      throw err;
    } finally {
      const endTime = Date.now();
      logEntry.duration = endTime - startTime;
      logEntry.status = c.res.status;

      if (error) {
        logEntry.error = error.message;
        logWithLevel("error", logEntry, opts.level);
      } else {
        // Log response body if enabled and status is successful
        if (opts.includeResponseBody && c.res.status < 400) {
          try {
            const responseClone = c.res.clone();
            const responseText = await responseClone.text();
            logEntry.responseBody = truncateBody(
              responseText,
              opts.maxBodyLength
            );
          } catch (err) {
            logEntry.responseBody = "[Failed to read response body]";
          }
        }

        const level = getLogLevelForStatus(c.res.status);
        logWithLevel(level, logEntry, opts.level);
      }
    }
  };
}

function generateRequestId(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15)
  );
}

function getClientIP(c: Context): string | undefined {
  // Try various headers that might contain the client IP
  return (
    c.req.header("CF-Connecting-IP") ||
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
    c.req.header("X-Real-IP") ||
    c.req.header("X-Client-IP") ||
    undefined
  );
}

function shouldLogBody(method: string): boolean {
  return ["POST", "PUT", "PATCH"].includes(method.toUpperCase());
}

function truncateBody(body: string, maxLength?: number): string {
  if (!maxLength || body.length <= maxLength) {
    return body;
  }
  return body.substring(0, maxLength) + "... [truncated]";
}

function getLogLevelForStatus(status: number): LogLevel {
  if (status >= 500) return "error";
  if (status >= 400) return "warn";
  return "info";
}

function logWithLevel(
  level: LogLevel,
  entry: LogEntry,
  configLevel?: LogLevel
): void {
  const currentLevel = configLevel || "info";

  if (logLevels[level] < logLevels[currentLevel]) {
    return;
  }

  const logMessage = formatLogEntry(entry);

  switch (level) {
    case "debug":
      console.debug(logMessage);
      break;
    case "info":
      console.info(logMessage);
      break;
    case "warn":
      console.warn(logMessage);
      break;
    case "error":
      console.error(logMessage);
      break;
  }
}

function formatLogEntry(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `${entry.method} ${entry.url}`,
    entry.status ? `${entry.status}` : "",
    entry.duration ? `${entry.duration}ms` : "",
    entry.requestId ? `(${entry.requestId})` : "",
  ].filter(Boolean);

  let message = parts.join(" ");

  if (entry.ip) {
    message += ` - IP: ${entry.ip}`;
  }

  if (entry.userAgent) {
    message += ` - UA: ${entry.userAgent}`;
  }

  if (entry.requestBody) {
    message += `\n  Request Body: ${
      typeof entry.requestBody === "string"
        ? entry.requestBody
        : JSON.stringify(entry.requestBody)
    }`;
  }

  if (entry.responseBody) {
    message += `\n  Response Body: ${
      typeof entry.responseBody === "string"
        ? entry.responseBody
        : JSON.stringify(entry.responseBody)
    }`;
  }

  if (entry.error) {
    message += `\n  Error: ${entry.error}`;
  }

  return message;
}
