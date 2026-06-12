import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { WechatMiniProgramService } from "./wechat-mini-program.service";

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

test("wechat mini login issues a session for bound open id", async () => {
  let refreshedUserId: string | undefined;
  const user = {
    id: "user-1",
    username: "worker",
    nickname: null,
    avatarUrl: null,
    email: null,
    phone: null,
    wechatOpenId: "openid-1",
    alipayUserId: null,
    isAuditor: false
  };
  const prisma = {
    user: {
      findUnique: async ({ where }: { where: { wechatOpenId: string } }) => {
        assert.deepEqual(where, { wechatOpenId: "openid-1" });
        return user;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        assert.deepEqual(where, { id: "user-1" });
        return user;
      },
      update: async ({ where, data }: { where: { id: string }; data: { refreshTokenHash: string } }) => {
        refreshedUserId = where.id;
        assert.equal(typeof data.refreshTokenHash, "string");
      }
    }
  };
  const jwt = {
    signAsync: async (payload: { jti?: string }) => (payload.jti ? "refresh-token" : "access-token")
  };
  const config = {
    get: (key: string) => {
      if (key === "JWT_ACCESS_SECRET") return "access-secret";
      if (key === "JWT_REFRESH_SECRET") return "refresh-secret";
      return undefined;
    }
  };
  const wechatMiniProgram = {
    resolveOpenId: async (code: string) => {
      assert.equal(code, "wx-code");
      return "openid-1";
    }
  };
  const service = new AuthService(
    prisma as never,
    jwt as never,
    config as never,
    undefined,
    undefined,
    wechatMiniProgram as never
  );

  const session = await service.loginWithWechatCode({ code: "wx-code" });

  assert.equal(session.user.wechatOpenId, "openid-1");
  assert.equal(session.accessToken, "access-token");
  assert.equal(session.refreshToken, "refresh-token");
  assert.equal(refreshedUserId, "user-1");
});

test("wechat mini program service reports missing config as a business error", async () => {
  const service = new WechatMiniProgramService({
    get: () => undefined
  } as never);

  await assert.rejects(
    () => service.resolveOpenId("wx-code"),
    (error) => {
      assert.ok(error instanceof BadRequestException);
      assert.equal(error.message, "微信小程序登录未配置");
      return true;
    }
  );
});

test("wechat mini program service exchanges code with configured app credentials", async () => {
  const originalFetch = globalThis.fetch;
  let requestedUrl: string | undefined;
  globalThis.fetch = (async (url: URL) => {
    requestedUrl = url.toString();
    return {
      ok: true,
      json: async () => ({ openid: "openid-1" })
    };
  }) as never;
  const service = new WechatMiniProgramService({
    get: (key: string) => {
      if (key === "WECHAT_MINI_APP_ID") return "mini-app-id";
      if (key === "WECHAT_MINI_APP_SECRET") return "mini-secret";
      return undefined;
    }
  } as never);

  try {
    const openId = await service.resolveOpenId("wx-code");

    assert.equal(openId, "openid-1");
    assert.ok(requestedUrl);
    const url = new URL(requestedUrl);
    assert.equal(url.searchParams.get("appid"), "mini-app-id");
    assert.equal(url.searchParams.get("secret"), "mini-secret");
    assert.equal(url.searchParams.get("js_code"), "wx-code");
    assert.equal(url.searchParams.get("grant_type"), "authorization_code");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
