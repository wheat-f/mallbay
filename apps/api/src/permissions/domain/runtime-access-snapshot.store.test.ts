import assert from "node:assert/strict";
import test from "node:test";
import { RuntimeAccessSnapshotStore } from "./runtime-access-snapshot.store";

test("runtime access snapshot store owns snapshot lifecycle", () => {
  const store = new RuntimeAccessSnapshotStore();

  assert.equal(store.has("u1"), false);
  store.set("u1", { roles: [], permissions: [] });
  assert.equal(store.has("u1"), true);

  store.clear("u1");
  assert.equal(store.has("u1"), false);

  store.set("u1", { roles: [], permissions: [] });
  store.set("u2", { roles: [], permissions: [] });
  store.clearAll();
  assert.equal(store.has("u1"), false);
  assert.equal(store.has("u2"), false);
});
