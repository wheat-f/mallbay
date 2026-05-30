import assert from "node:assert/strict";
import { test } from "node:test";
import { recordPrismaQueryTrace } from "./prisma.service";

test("recordPrismaQueryTrace emits sanitized Prisma trace logs and metrics", () => {
  const entries: unknown[] = [];
  const increments: unknown[] = [];
  const latencies: unknown[] = [];
  const logger = {
    debug: (event: string, fields: Record<string, unknown>) => entries.push({ event, ...fields })
  };
  const metrics = {
    increment: (name: string, labels: Record<string, string>) => increments.push({ name, labels }),
    recordLatency: (name: string, valueMs: number, labels: Record<string, string>) =>
      latencies.push({ name, valueMs, labels })
  };

  recordPrismaQueryTrace(
    {
      query: 'SELECT * FROM "User" WHERE "passwordHash" = $1',
      params: '["secret"]',
      duration: 12,
      target: "quaint::connector::metrics"
    },
    logger as never,
    metrics as never
  );

  assert.deepEqual(entries, [
    {
      event: "trace.prisma.query",
      component: "prisma",
      target: "quaint::connector::metrics",
      durationMs: 12,
      query: 'SELECT * FROM "User" WHERE "passwordHash" = $1'
    }
  ]);
  assert.deepEqual(increments, [
    {
      name: "trace_operations_total",
      labels: { component: "prisma", operation: "prisma.query", status: "success" }
    }
  ]);
  assert.deepEqual(latencies, [
    {
      name: "trace_operation_duration_ms",
      valueMs: 12,
      labels: { component: "prisma", operation: "prisma.query" }
    }
  ]);
});
