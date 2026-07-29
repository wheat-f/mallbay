import { test } from "node:test";
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

test("settings audit access is restricted to manager, finance, or HQ auditor", () => {
  const source = readFileSync("src/settings/audit.service.ts", "utf8");
  assert.match(source, /!\["MANAGER", "FINANCE"\]\.includes\(actor\.storeMember\.position\)/);
  assert.match(source, /position === "FINANCE" && requestedDomain !== "FINANCE"/);
  assert.match(source, /requestedDomain === "FINANCE"/);
});