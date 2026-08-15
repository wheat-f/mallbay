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

test("MetricsService bounds latency samples to protect long-lived API memory", () => {
  const metrics = new MetricsService();
  for (let index = 0; index < 1025; index += 1) metrics.recordLatency("order_lifecycle_command_duration_ms", index, { commandType: "CREATE_ORDER" });

  const samples = metrics.getLatencies("order_lifecycle_command_duration_ms", { commandType: "CREATE_ORDER" });
  assert.equal(samples.length, 1024);
  assert.equal(samples[0], 1);
  assert.equal(samples.at(-1), 1024);
});

test("MetricsService exports stable counter and latency summaries", () => {
  const metrics = new MetricsService();
  metrics.increment("order_lifecycle_commands_total", { source: "WEB", commandType: "CREATE_ORDER" }, 2);
  metrics.recordLatency("order_lifecycle_command_duration_ms", 10, { source: "WEB" });
  metrics.recordLatency("order_lifecycle_command_duration_ms", 30, { source: "WEB" });
  metrics.recordLatency("order_lifecycle_command_duration_ms", 20, { source: "WEB" });

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.counters[0]?.value, 2);
  assert.deepEqual(snapshot.counters[0]?.labels, { source: "WEB", commandType: "CREATE_ORDER" });
  assert.deepEqual(snapshot.latencies[0], {
    name: "order_lifecycle_command_duration_ms",
    labels: { source: "WEB" },
    count: 3,
    p50Ms: 20,
    p95Ms: 30,
    p99Ms: 30,
    maxMs: 30
  });
});
