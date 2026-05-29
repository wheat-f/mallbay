import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";
import { httpObservabilityMiddleware } from "./http-observability.middleware";

test("httpObservabilityMiddleware records latency, status, and structured request log", () => {
  const metrics = new MetricsService();
  const entries: unknown[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));
  const listeners: Record<string, () => void> = {};
  const req = {
    method: "GET",
    originalUrl: "/stores?keyword=test",
    route: { path: "/stores" },
    requestId: "req_http_1"
  };
  const res = {
    statusCode: 200,
    on: (event: string, callback: () => void) => {
      listeners[event] = callback;
    }
  };

  httpObservabilityMiddleware(metrics, logger)(req as never, res as never, () => undefined);
  listeners.finish();

  assert.equal(
    metrics.getCounter("http_requests_total", {
      method: "GET",
      route: "/stores",
      status: "200"
    }),
    1
  );
  assert.equal(
    metrics.getLatencies("http_request_duration_ms", { method: "GET", route: "/stores" }).length,
    1
  );
  assert.equal((entries[0] as { event: string }).event, "http.request");
});
