import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("admin entry copy does not expose the legacy auditor role", () => {
  const dashboardSource = readFileSync("app/dashboard/page.tsx", "utf8");
  const homeSource = readFileSync("app/page.tsx", "utf8");

  assert.match(dashboardSource, /系统审核/);
  assert.match(dashboardSource, /门店审核/);
  assert.match(dashboardSource, /管理员/);
  assert.doesNotMatch(dashboardSource, /审核员工作台/);
  assert.doesNotMatch(homeSource, /审核员工作台/);
});
