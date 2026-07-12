import assert from "node:assert/strict";
import { test } from "node:test";
import { HealthController } from "./health.controller";

test("health probe returns a stable readiness response", () => {
  assert.deepEqual(new HealthController().check(), { status: "ok" });
});
