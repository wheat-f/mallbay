import assert from "node:assert/strict";
import { test } from "node:test";
import { NotFoundException } from "@nestjs/common";
import { MetricsController } from "./metrics.controller";
import { MetricsService } from "./metrics.service";

test("MetricsController hides the internal endpoint without the configured token", () => {
  const controller = new MetricsController(new MetricsService(), { get: () => "secret" } as never);
  assert.throws(() => controller.snapshot("wrong"), NotFoundException);
});

test("MetricsController returns the metrics snapshot with the configured token", () => {
  const metrics = new MetricsService();
  metrics.increment("order_lifecycle_commands_total", { source: "WEB" });
  const controller = new MetricsController(metrics, { get: () => "secret" } as never);
  const snapshot = controller.snapshot("secret");
  assert.equal(snapshot.counters[0]?.name, "order_lifecycle_commands_total");
});
