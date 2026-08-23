import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { ProductCatalog } from "./domain/product-catalog";
import { ProductsModule } from "./products.module";
import { ProductsService } from "./products.service";

test("ProductCatalog exposes product master-data and lifecycle capabilities through one seam", async () => {
  const calls: string[] = [];
  const implementation = {
    create: async () => { calls.push("create"); return { id: "product-1" }; },
    list: async () => { calls.push("list"); return { items: [] }; },
    detail: async () => { calls.push("detail"); return { id: "product-1" }; },
    update: async () => { calls.push("update"); return { id: "product-1" }; },
    updateStandardCost: async () => { calls.push("standard-cost"); return { id: "product-1" }; },
    updateUnitSuggestedPrices: async () => { calls.push("unit-suggested-prices"); return { id: "product-1" }; },
    remove: async () => { calls.push("remove"); return { id: "product-1" }; }
  } as never;
  const catalog = new ProductCatalog(implementation);
  const user = { id: "manager-1" } as never;

  await catalog.create(user, {} as never);
  await catalog.list(user, {} as never);
  await catalog.detail(user, "product-1");
  await catalog.update(user, "product-1", {} as never);
  await catalog.updateStandardCost(user, "product-1", 1200);
  await catalog.updateUnitSuggestedPrices(user, "product-1", []);
  await catalog.remove(user, "product-1");

  assert.deepEqual(calls, [
    "create",
    "list",
    "detail",
    "update",
    "standard-cost",
    "unit-suggested-prices",
    "remove"
  ]);
});

test("ProductsController crosses ProductCatalog and ProductsService stays internal", () => {
  const sourceRoot = path.resolve(__dirname);
  const controllerSource = readFileSync(path.join(sourceRoot, "products.controller.ts"), "utf8");
  const providers = new Set((Reflect.getMetadata("providers", ProductsModule) ?? []) as unknown[]);
  const exports = new Set((Reflect.getMetadata("exports", ProductsModule) ?? []) as unknown[]);

  assert.match(controllerSource, /ProductCatalog/);
  assert.doesNotMatch(controllerSource, /ProductsService/);
  assert.equal(providers.has(ProductCatalog), true);
  assert.equal(providers.has(ProductsService), true);
  assert.equal(exports.has(ProductCatalog), true);
  assert.equal(exports.has(ProductsService), false);
  assert.equal([...providers].some((provider) => typeof provider === "function" && provider.name === "ProductRepository"), false);
});
