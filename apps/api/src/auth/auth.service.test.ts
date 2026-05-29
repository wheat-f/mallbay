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

test("login failure increments observability metric without sensitive labels", async () => {
  const increments: Array<{ name: string; labels: Record<string, string> }> = [];
  const prisma = {
    user: {
      findFirst: async () => null
    }
  };
  const metrics = {
    increment: (name: string, labels: Record<string, string>) => {
      increments.push({ name, labels });
    }
  };
  const service = new AuthService(
    prisma as never,
    {} as never,
    {} as never,
    metrics as never
  );

  await assert.rejects(
    () => service.login({ identifier: "owner", password: "wrong-password" }),
    /账号或密码不正确/
  );

  assert.deepEqual(increments, [
    {
      name: "auth_login_failures_total",
      labels: { reason: "not_found" }
    }
  ]);
});
