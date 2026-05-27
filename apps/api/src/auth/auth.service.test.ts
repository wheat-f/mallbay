import assert from "node:assert/strict";
import { test } from "node:test";
import { AuthService } from "./auth.service";

test("issueAndPersistTokens fails fast when JWT secrets are missing", async () => {
  const prisma = {
    user: {
      findUniqueOrThrow: async () => ({
        id: "user-1",
        username: "owner",
        nickname: null,
        avatarUrl: null,
        email: null,
        phone: null,
        wechatOpenId: null,
        alipayUserId: null,
        isAuditor: false
      }),
      update: async () => ({})
    }
  };
  const jwt = {
    signAsync: async () => "signed-token"
  };
  const config = {
    get: () => undefined
  };
  const service = new AuthService(prisma as never, jwt as never, config as never);

  await assert.rejects(
    () => service["issueAndPersistTokens"]("user-1"),
    /JWT_ACCESS_SECRET 未配置/
  );
});

