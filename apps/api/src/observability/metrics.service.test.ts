import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsService } from "./metrics.service";

test("MetricsService increments counters and records latency samples", () => {
  const metrics = new MetricsService();

  metrics.increment("http_requests_total", { method: "GET", status: "200" });
  metrics.increment("http_requests_total", { status: "200", method: "GET" });
  metrics.recordLatency("http_request_duration_ms", 42, { route: "/stores" });

  assert.equal(metrics.getCounter("http_requests_total", { method: "GET", status: "200" }), 2);
  assert.deepEqual(metrics.getLatencies("http_request_duration_ms", { route: "/stores" }), [42]);
});
