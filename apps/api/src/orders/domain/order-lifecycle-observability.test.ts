import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsService } from "../../observability/metrics.service";
import { StructuredLoggerService } from "../../observability/structured-logger.service";
import { OrderLifecycleObservability } from "./order-lifecycle-observability";

test("OrderLifecycleObservability records structured command, replay, latency and rollback fields", () => {
  const metrics = new MetricsService();
  const entries: Record<string, unknown>[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));
  const observability = new OrderLifecycleObservability(metrics, logger);

  observability.record({
    commandType: "COMPLETE_CONSTRUCTION",
    source: "CONSTRUCTION_WEB",
    replayed: true,
    beforeVersion: 3,
    afterVersion: 3,
    resultCode: "REPLAYED",
    durationMs: 17,
    crossStore: true,
    rolledBack: false,
    notificationIntentCount: 2
  });
  observability.record({
    commandType: "CREATE_ORDER",
    source: "WEB",
    replayed: false,
    beforeVersion: 0,
    afterVersion: null,
    resultCode: "INTERNAL_FAILURE",
    durationMs: 21,
    crossStore: false,
    rolledBack: true,
    notificationIntentCount: 0
  });

  assert.equal(metrics.getCounter("order_lifecycle_commands_total", {
    commandType: "COMPLETE_CONSTRUCTION",
    source: "CONSTRUCTION_WEB",
    outcome: "REPLAYED",
    crossStore: "true",
    rolledBack: "false"
  }), 1);
  assert.equal(metrics.getCounter("order_lifecycle_replays_total", {
    commandType: "COMPLETE_CONSTRUCTION",
    source: "CONSTRUCTION_WEB",
    outcome: "REPLAYED",
    crossStore: "true",
    rolledBack: "false"
  }), 1);
  assert.equal(metrics.getCounter("order_lifecycle_rollbacks_total", {
    commandType: "CREATE_ORDER",
    source: "WEB",
    outcome: "INTERNAL_FAILURE",
    crossStore: "false",
    rolledBack: "true"
  }), 1);
  assert.deepEqual(metrics.getLatencies("order_lifecycle_command_duration_ms", {
    commandType: "CREATE_ORDER",
    source: "WEB"
  }), [21]);
  assert.deepEqual(entries.map((entry) => ({
    event: entry.event,
    commandType: entry.commandType,
    replayed: entry.replayed,
    rolledBack: entry.rolledBack,
    notificationIntentCount: entry.notificationIntentCount
  })), [
    { event: "order_lifecycle.command", commandType: "COMPLETE_CONSTRUCTION", replayed: true, rolledBack: false, notificationIntentCount: 2 },
    { event: "order_lifecycle.command", commandType: "CREATE_ORDER", replayed: false, rolledBack: true, notificationIntentCount: 0 }
  ]);
});
