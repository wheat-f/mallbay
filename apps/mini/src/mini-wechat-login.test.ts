import { test } from "node:test";
import assert from "node:assert/strict";
import { AUTH_TOKEN_KEY, STORE_ID_KEY, loginMiniWithWechat, type MiniWechatLoginPlatform } from "./mini-wechat-login";

test("loginMiniWithWechat exchanges wx login code and persists token with store id", async () => {
  const storage = new Map<string, unknown>();
  const requests: Array<{ url: string; method?: string; data?: unknown; header?: Record<string, string> }> = [];
  const platform: MiniWechatLoginPlatform = {
    login: async () => ({ code: "wx-code" }),
    request: async (options) => {
      requests.push(options);
      if (options.url.endsWith("/auth/wechat-login")) {
        return { accessToken: "access-token" };
      }
      return { storeMember: { store: { id: "store-1" } } };
    },
    setStorageSync: (key, value) => storage.set(key, value)
  };

  const result = await loginMiniWithWechat(platform, { apiBaseUrl: " http://localhost:3001/ " });

  assert.deepEqual(result, { token: "access-token", storeId: "store-1" });
  assert.equal(storage.get(AUTH_TOKEN_KEY), "access-token");
  assert.equal(storage.get(STORE_ID_KEY), "store-1");
  assert.deepEqual(requests, [
    {
      url: "http://localhost:3001/auth/wechat-login",
      method: "POST",
      header: { "Content-Type": "application/json" },
      data: { code: "wx-code" }
    },
    {
      url: "http://localhost:3001/auth/me",
      method: "GET",
      header: { Authorization: "Bearer access-token" }
    }
  ]);
});
