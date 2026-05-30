import assert from "node:assert/strict";
import { test } from "node:test";
import { authStorePartialize } from "./auth-store";

test("auth store persistence excludes access and refresh tokens", () => {
  const persisted = authStorePartialize({
    hasHydrated: true,
    user: {
      id: "user-1",
      username: "mallbay",
      nickname: null,
      avatarUrl: null,
      email: null,
      phone: null,
      wechatOpenId: null,
      alipayUserId: null,
      isAuditor: false
    },
    accessToken: "access-token",
    refreshToken: "refresh-token",
    setHasHydrated: () => undefined,
    setSession: () => undefined,
    clearSession: () => undefined
  });

  assert.deepEqual(Object.keys(persisted), ["user"]);
  assert.equal("accessToken" in persisted, false);
  assert.equal("refreshToken" in persisted, false);
});
