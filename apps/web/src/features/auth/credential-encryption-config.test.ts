import assert from "node:assert/strict";
import { test } from "node:test";
import { isCredentialEncryptionEnabled } from "./credential-encryption-config";

test("credential encryption is enabled by default", () => {
  assert.equal(isCredentialEncryptionEnabled(undefined), true);
  assert.equal(isCredentialEncryptionEnabled(""), true);
});

test("credential encryption can be disabled explicitly for HTTP-only test environments", () => {
  assert.equal(isCredentialEncryptionEnabled("false"), false);
  assert.equal(isCredentialEncryptionEnabled("FALSE"), false);
  assert.equal(isCredentialEncryptionEnabled("0"), false);
});

test("credential encryption remains enabled for any non-disable value", () => {
  assert.equal(isCredentialEncryptionEnabled("true"), true);
  assert.equal(isCredentialEncryptionEnabled("yes"), true);
});
