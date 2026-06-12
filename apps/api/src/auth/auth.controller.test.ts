import assert from "node:assert/strict";
import { test } from "node:test";
import type { Request, Response } from "express";
import { AuthController, REFRESH_TOKEN_COOKIE_NAME } from "./auth.controller";

const authResponse = {
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
  refreshToken: "refresh-token"
};

function createResponse() {
  const cookies: Record<string, unknown> = {};
  const clearedCookies: Record<string, unknown> = {};
  return {
    response: {
      cookie: (name: string, value: string, options: unknown) => {
        cookies[name] = { value, options };
      },
      clearCookie: (name: string, options: unknown) => {
        clearedCookies[name] = options;
      }
    } as Response,
    cookies,
    clearedCookies
  };
}

test("register returns the legacy token response and sets refresh token cookie", async () => {
  const service = {
    register: async () => authResponse
  };
  const controller = new AuthController(service as never);
  const { response, cookies } = createResponse();

  const result = await controller.register({ username: "mallbay", password: "password" }, response);

  assert.equal(result.refreshToken, "refresh-token");
  assert.deepEqual(cookies[REFRESH_TOKEN_COOKIE_NAME], {
    value: "refresh-token",
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/auth",
      maxAge: 604_800_000
    }
  });
});

test("refresh reads refresh token from cookie when request body is empty", async () => {
  let capturedRefreshToken: string | undefined;
  const service = {
    refresh: async (refreshToken: string) => {
      capturedRefreshToken = refreshToken;
      return authResponse;
    }
  };
  const controller = new AuthController(service as never);
  const { response, cookies } = createResponse();
  const request = {
    headers: {
      cookie: `${REFRESH_TOKEN_COOKIE_NAME}=cookie-refresh-token`
    }
  } as Request;

  await controller.refresh({}, request, response);

  assert.equal(capturedRefreshToken, "cookie-refresh-token");
  assert.equal((cookies[REFRESH_TOKEN_COOKIE_NAME] as { value: string }).value, "refresh-token");
});

test("wechat mini login returns token response and sets refresh token cookie", async () => {
  let capturedCode: string | undefined;
  const service = {
    loginWithWechatCode: async (dto: { code: string }) => {
      capturedCode = dto.code;
      return authResponse;
    }
  };
  const controller = new AuthController(service as never);
  const { response, cookies } = createResponse();

  const result = await controller.wechatLogin({ code: "wx-code" }, response);

  assert.equal(capturedCode, "wx-code");
  assert.equal(result.accessToken, "access-token");
  assert.deepEqual(cookies[REFRESH_TOKEN_COOKIE_NAME], {
    value: "refresh-token",
    options: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/auth",
      maxAge: 604_800_000
    }
  });
});

test("logout clears refresh token cookie after invalidating the server token", async () => {
  let capturedUserId: string | undefined;
  const service = {
    logout: async (userId: string) => {
      capturedUserId = userId;
      return { success: true };
    }
  };
  const controller = new AuthController(service as never);
  const { response, clearedCookies } = createResponse();
  const request = {
    user: {
      id: "user-1",
      username: "mallbay"
    }
  } as Request & { user: { id: string; username: string } };

  const result = await controller.logout(request, response);

  assert.deepEqual(result, { success: true });
  assert.equal(capturedUserId, "user-1");
  assert.deepEqual(clearedCookies[REFRESH_TOKEN_COOKIE_NAME], {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/auth"
  });
});
