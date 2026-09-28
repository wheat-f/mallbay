import assert from "node:assert/strict";
import { test } from "node:test";
import { requireBindingCommandId } from "./require-binding-command-id";

test("binding mutations require a stable client request id", () => {
  assert.equal(requireBindingCommandId(" cmd-1 "), "cmd-1");
  assert.throws(() => requireBindingCommandId(undefined), /X-Request-Id/);
  assert.throws(() => requireBindingCommandId(" ".repeat(3)), /X-Request-Id/);
  assert.throws(() => requireBindingCommandId("x".repeat(129)), /X-Request-Id/);
});
