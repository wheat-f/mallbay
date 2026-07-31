import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("dictionary directory and paginated detail contracts are exposed", () => {
  const controller = readFileSync("src/settings/dictionaries.controller.ts", "utf8");
  const service = readFileSync("src/settings/dictionaries.service.ts", "utf8");
  const templateController = readFileSync("src/settings/dictionary-templates.controller.ts", "utf8");
  const templateService = readFileSync("src/settings/dictionary-templates.service.ts", "utf8");
  assert.match(controller, /@Get\("catalog"\)/);
  assert.match(controller, /@Get\("defaults\/backfill\/preview"\)/);
  assert.match(controller, /@Post\(":id\/items\/import\/preview"\)/);
  assert.match(controller, /@Post\(":id\/items\/import\/commit"\)/);
  assert.match(service, /async catalog\(user: AuthenticatedSettingsUser/);
  assert.match(service, /normalizePagination\(query\.page, query\.pageSize\)/);
  assert.match(service, /async previewImportItems/);
  assert.match(service, /async commitImportItems/);
  assert.match(service, /async initializeDefaultsForStore/);
  assert.match(templateController, /@Get\("catalog"\)/);
  assert.match(templateController, /@Get\(":id\/items"\)/);
  assert.match(templateService, /async catalog\(user: AuthenticatedSettingsUser/);
  assert.match(templateService, /async listItems\(user: AuthenticatedSettingsUser/);
});

test("normal dictionary reads do not initialize defaults", () => {
  const service = readFileSync("src/settings/dictionaries.service.ts", "utf8");
  const listStart = service.indexOf("  async list(user:");
  const listEnd = service.indexOf("  async initializeDefaultsForStore", listStart);
  assert.ok(listStart >= 0 && listEnd > listStart);
  assert.doesNotMatch(service.slice(listStart, listEnd), /ensureDefaults\(/);
});