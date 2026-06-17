import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("PurchasesController exposes the purchases API boundary", () => {
  const controllerPath = "src/purchases/purchases.controller.ts";

  assert.equal(existsSync(controllerPath), true);

  const source = readFileSync(controllerPath, "utf8");

  assert.match(source, /@Controller\("purchases"\)/);
  assert.match(source, /@Get\("overview"\)/);
  assert.match(source, /@Get\("requirements"\)/);
  assert.match(source, /@Post\("requirements"\)/);
  assert.match(source, /@Get\("orders"\)/);
  assert.match(source, /@Get\("orders\/:id"\)/);
  assert.match(source, /@Post\("orders\/:id\/approve"\)/);
  assert.match(source, /@Post\("orders\/items\/:id\/receive-batches"\)/);
  assert.match(source, /@Get\("suppliers"\)/);
  assert.match(source, /@Post\("suppliers"\)/);
});
