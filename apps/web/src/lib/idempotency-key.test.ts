import assert from "node:assert/strict";
import { test } from "node:test";
import { createIdempotencyKey } from "./idempotency-key";

test("uses randomUUID when available", () => {
  assert.equal(createIdempotencyKey({ randomUUID: () => "stable-test-key" }), "stable-test-key");
});

test("creates a UUID v4 with getRandomValues when randomUUID is unavailable", () => {
  let filled = false;
  const key = createIdempotencyKey({
    getRandomValues: (bytes) => {
      filled = true;
      bytes.fill(0);
      return bytes;
    }
  });

  assert.equal(filled, true);
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("falls back to a UUID-shaped key when Web Crypto is unavailable", () => {
  assert.match(createIdempotencyKey(null), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});
