import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsService } from "../observability/metrics.service";
import { StructuredLoggerService } from "../observability/structured-logger.service";
import { OrderLifecycleClientEventsController } from "./order-lifecycle-client-events.controller";
import { OrderLifecycleClientEventDto } from "./dto/order-lifecycle-client-event.dto";
import { validate } from "class-validator";

test("client event endpoint records bounded, non-business page events", () => {
  const metrics = new MetricsService();
  const entries: Record<string, unknown>[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));
  const controller = new OrderLifecycleClientEventsController(metrics, logger);

  assert.deepEqual(controller.record({
    event: "RESULT_UNKNOWN",
    surface: "ORDER_CREATE",
    commandType: "CREATE_ORDER",
    source: "WEB"
  }), { accepted: true });
  assert.equal(metrics.getCounter("order_lifecycle_client_events_total", {
    event: "RESULT_UNKNOWN",
    source: "WEB",
    surface: "ORDER_CREATE",
    commandType: "CREATE_ORDER"
  }), 1);
  assert.deepEqual(entries[0], {
    level: "info",
    event: "order_lifecycle_client_event",
    clientEvent: "RESULT_UNKNOWN",
    source: "WEB",
    surface: "ORDER_CREATE",
    commandType: "CREATE_ORDER"
  });
});

test("client event DTO rejects values outside the allowlist", async () => {
  const dto = Object.assign(new OrderLifecycleClientEventDto(), {
    event: "CUSTOMER_PHONE",
    surface: "ORDER_CREATE",
    source: "WEB"
  });
  const errors = await validate(dto);
  assert.ok(errors.length > 0);
});
