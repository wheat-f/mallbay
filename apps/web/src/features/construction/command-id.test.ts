import assert from "node:assert/strict";
import { test } from "node:test";
import { clearLifecycleCommandId, getLifecycleCommandTimestamp } from "./api";

test("completion timestamp stays stable across retries and clears with the command id", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", { configurable: true, value: { sessionStorage: storage } });
  try {
    const first = getLifecycleCommandTimestamp("actor", "store", "order", "COMPLETE_CONSTRUCTION");
    const retry = getLifecycleCommandTimestamp("actor", "store", "order", "COMPLETE_CONSTRUCTION");
    assert.equal(retry, first);
    clearLifecycleCommandId("actor", "store", "order", "COMPLETE_CONSTRUCTION");
    assert.equal(values.size, 0);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: previousWindow });
  }
});
