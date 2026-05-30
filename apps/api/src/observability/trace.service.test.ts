import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";
import { TraceService } from "./trace.service";

test("TraceService records successful operation traces with latency metrics", async () => {
  const entries: unknown[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));
  const metrics = new MetricsService();
  const trace = new TraceService(logger, metrics);

  const result = await trace.traceOperation(
    "oss.upload",
    { component: "oss", target: "avatar" },
    async () => "uploaded"
  );

  assert.equal(result, "uploaded");
  assert.equal(metrics.getCounter("trace_operations_total", { component: "oss", operation: "oss.upload", status: "success" }), 1);
  assert.equal(metrics.getLatencies("trace_operation_duration_ms", { component: "oss", operation: "oss.upload" }).length, 1);
  assert.equal((entries[0] as { event: string }).event, "trace.oss.upload");
  assert.equal((entries[0] as { status: string }).status, "success");
});

test("TraceService records failed operation traces and rethrows", async () => {
  const entries: unknown[] = [];
  const logger = new StructuredLoggerService((entry) => entries.push(entry));
  const metrics = new MetricsService();
  const trace = new TraceService(logger, metrics);

  await assert.rejects(
    () =>
      trace.traceOperation("prisma.query", { component: "prisma" }, async () => {
        throw new Error("database unavailable");
      }),
    /database unavailable/
  );

  assert.equal(metrics.getCounter("trace_operations_total", { component: "prisma", operation: "prisma.query", status: "error" }), 1);
  assert.equal((entries[0] as { event: string }).event, "trace.prisma.query");
  assert.equal((entries[0] as { status: string }).status, "error");
  assert.equal((entries[0] as { errorName: string }).errorName, "Error");
});
