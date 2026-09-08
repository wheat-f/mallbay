import { test } from "node:test";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

test("settings audit access is derived from AccessContext scope facts", () => {
  const source = readFileSync("src/settings/audit.service.ts", "utf8");
  assert.match(source, /this\.scope\(actor\.id, "settings\.audit\.global", "read"\)/);
  assert.match(source, /this\.scope\(actor\.id, "finance\.audit", "read"\)/);
  assert.doesNotMatch(source, /storeMember|isAuditor/);
  assert.match(source, /requestedDomain === "FINANCE"/);
});
