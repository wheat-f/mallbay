import { test } from "node:test";
import assert from "node:assert/strict";
import {
  API_BASE_URL_KEY,
  AUTH_TOKEN_KEY,
  STORE_ID_KEY,
  getMiniAuthConfig,
  saveMiniAuthConfig,
  validateMiniAuthConfig,
  type MiniConfigStorage
} from "./mini-auth-config";

test("validateMiniAuthConfig trims and accepts complete runtime config", () => {
  assert.deepEqual(
    validateMiniAuthConfig({
      apiBaseUrl: " http://localhost:3001/ ",
      token: " token-1 ",
      storeId: " store-1 "
    }),
    {
      ok: true,
      value: {
        apiBaseUrl: "http://localhost:3001",
        token: "token-1",
        storeId: "store-1"
      }
    }
  );
});

test("validateMiniAuthConfig rejects missing fields", () => {
  assert.deepEqual(validateMiniAuthConfig({ apiBaseUrl: "", token: "token-1", storeId: "store-1" }), {
    ok: false,
    message: "请填写 API 地址"
  });
  assert.deepEqual(validateMiniAuthConfig({ apiBaseUrl: "http://localhost:3001", token: "", storeId: "store-1" }), {
    ok: false,
    message: "请填写 access token"
  });
  assert.deepEqual(validateMiniAuthConfig({ apiBaseUrl: "http://localhost:3001", token: "token-1", storeId: "" }), {
    ok: false,
    message: "请填写门店 ID"
  });
});

test("saveMiniAuthConfig persists normalized runtime config", () => {
  const storage = createStorage();

  const result = saveMiniAuthConfig(storage, {
    apiBaseUrl: "http://localhost:3001/",
    token: "token-1",
    storeId: "store-1"
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(storage.getStorageSync(API_BASE_URL_KEY), "http://localhost:3001");
  assert.equal(storage.getStorageSync(AUTH_TOKEN_KEY), "token-1");
  assert.equal(storage.getStorageSync(STORE_ID_KEY), "store-1");
  assert.deepEqual(getMiniAuthConfig(storage), {
    apiBaseUrl: "http://localhost:3001",
    token: "token-1",
    storeId: "store-1"
  });
});

function createStorage(): MiniConfigStorage {
  const storage = new Map<string, unknown>();
  return {
    getStorageSync: (key) => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value)
  };
}
