import assert from "node:assert/strict";
import { test } from "node:test";
import { getStoreWorkbenchHref, getWorkbenchSections } from "./navigation";

test("workbench links use the effective permission snapshot instead of StoreMember position", () => {
  const sections = getWorkbenchSections([
    { code: "products", actions: ["read"] },
    { code: "inventory", actions: ["read"] },
    { code: "store.members", actions: ["write"] }
  ], "store-1");

  assert.deepEqual(sections.map((section) => section.title), ["履约与供应链"]);
  assert.deepEqual(sections[0]?.items.map((item) => item.label), ["产品管理", "库存管理"]);
});

test("workbench hides all entries until an effective permission snapshot is available", () => {
  assert.deepEqual(getWorkbenchSections(undefined, "store-1"), []);
  assert.deepEqual(getWorkbenchSections([], "store-1"), []);
});

test("workbench action visibility checks the requested action as well as the capability", () => {
  const sections = getWorkbenchSections([{ code: "orders", actions: ["read"] }], "store-1");
  const actions = sections.flatMap((section) => section.items).map((item) => item.label);

  assert.deepEqual(actions, ["订单管理"]);
  assert.equal(getStoreWorkbenchHref("store-1"), "/workbench/store-1");
});
