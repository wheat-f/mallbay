import { Inject, Injectable, Optional } from "@nestjs/common";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogSink = (entry: Record<string, unknown>) => void;

export const STRUCTURED_LOG_SINK = Symbol("STRUCTURED_LOG_SINK");

const SENSITIVE_KEYS = new Set([
  "accessToken",
  "password",
  "passwordHash",
  "refreshToken",
  "refreshTokenHash",
  "token"
]);

@Injectable()
export class StructuredLoggerService {
  private readonly sink: LogSink;

  constructor(@Optional() @Inject(STRUCTURED_LOG_SINK) sink?: LogSink) {
    this.sink = sink ?? defaultSink;
  }

  debug(event: string, fields: Record<string, unknown> = {}) {
    this.write("debug", event, fields);
  }

  info(event: string, fields: Record<string, unknown> = {}) {
    this.write("info", event, fields);
  }

  warn(event: string, fields: Record<string, unknown> = {}) {
    this.write("warn", event, fields);
  }

  error(event: string, fields: Record<string, unknown> = {}) {
    this.write("error", event, fields);
  }

  private write(level: LogLevel, event: string, fields: Record<string, unknown>) {
    const sanitizedFields = sanitize(fields) as Record<string, unknown>;
    this.sink({
      level,
      event,
      ...sanitizedFields
    });
  }
}

export function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    sanitized[key] = SENSITIVE_KEYS.has(key) ? "[REDACTED]" : sanitize(item);
  }
  return sanitized;
}

function defaultSink(entry: Record<string, unknown>) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  });

  if (entry.level === "error") {
    console.error(line);
    return;
  }
  if (entry.level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}
