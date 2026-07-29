import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useAuthStore } from "../stores/auth-store";
import { request } from "./request";

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow
  });
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null });
});

test("request sends auth token and parses JSON responses", async () => {
  useAuthStore.setState({ accessToken: "access-token" });
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ success: true })
    } as Response;
  }) as typeof fetch;

  const result = await request<{ success: boolean }>("/test", {
    method: "POST",
    body: JSON.stringify({ name: "mallbay" })
  });

  assert.deepEqual(result, { success: true });
  assert.equal(capturedInput, "http://localhost:3001/test");
  assert.equal(capturedInit?.credentials, "include");
  const authHeaders = capturedInit?.headers as Record<string, string>;
  assert.equal(typeof authHeaders["X-Request-Id"], "string");
  delete authHeaders["X-Request-Id"];
  assert.deepEqual(authHeaders, {
    "Content-Type": "application/json",
    Authorization: "Bearer access-token"
  });
});

test("request sends JSON content type for unauthenticated requests", async () => {
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ success: true })
    } as Response;
  }) as typeof fetch;

  await request<{ success: boolean }>("/auth/login", {
    method: "POST",
    auth: false,
    body: JSON.stringify({
      identifier: "xiaoming",
      encryptedPassword: "ciphertext"
    })
  });
  const unauthHeaders = capturedInit?.headers as Record<string, string>;
  assert.equal(typeof unauthHeaders["X-Request-Id"], "string");
  delete unauthHeaders["X-Request-Id"];
  assert.deepEqual(unauthHeaders, {
    "Content-Type": "application/json"
  });

});

test("request refreshes session and retries once after an authenticated 401 response", async () => {
  useAuthStore.setState({ accessToken: "expired-token" });
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)} ${String((init?.headers as Record<string, string>)?.Authorization ?? "")}`);
    if (String(input).endsWith("/test")) {
      if (calls.length === 1) {
        return {
          ok: false,
          status: 401,
          json: async () => ({ code: "UNAUTHORIZED", message: "Unauthorized" })
        } as Response;
      }
      return {
        ok: true,
        json: async () => ({ success: true })
      } as Response;
    }
    if (String(input).endsWith("/auth/refresh")) {
      return {
        ok: true,
        json: async () => ({
          accessToken: "fresh-token",
          refreshToken: "legacy-refresh-token",
          user: {
            id: "user-1",
            username: "alice",
            nickname: null,
            avatarUrl: null,
            email: null,
            phone: null,
            wechatOpenId: null,
            alipayUserId: null,
            isAuditor: false
          }
        })
      } as Response;
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  }) as typeof fetch;

  const result = await request<{ success: boolean }>("/test");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(calls, [
    "GET http://localhost:3001/test Bearer expired-token",
    "POST http://localhost:3001/auth/refresh ",
    "GET http://localhost:3001/test Bearer fresh-token"
  ]);
  assert.equal(useAuthStore.getState().accessToken, "fresh-token");
});

test("request restores the access token before the first authenticated request after reload", async () => {
  useAuthStore.setState({
    user: {
      id: "user-1",
      username: "alice",
      nickname: null,
      avatarUrl: null,
      email: null,
      phone: null,
      wechatOpenId: null,
      alipayUserId: null,
      isAuditor: false
    },
    accessToken: null
  });
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(input)} ${String((init?.headers as Record<string, string>)?.Authorization ?? "")}`);
    if (String(input).endsWith("/auth/refresh")) {
      return {
        ok: true,
        json: async () => ({
          accessToken: "fresh-token",
          refreshToken: "legacy-refresh-token",
          user: {
            id: "user-1",
            username: "alice",
            nickname: null,
            avatarUrl: null,
            email: null,
            phone: null,
            wechatOpenId: null,
            alipayUserId: null,
            isAuditor: false
          }
        })
      } as Response;
    }
    if (String(input).endsWith("/test")) {
      return {
        ok: true,
        json: async () => ({ success: true })
      } as Response;
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  }) as typeof fetch;

  const result = await request<{ success: boolean }>("/test");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(calls, [
    "POST http://localhost:3001/auth/refresh ",
    "GET http://localhost:3001/test Bearer fresh-token"
  ]);
});

test("request clears session and redirects to auth when refresh after 401 fails", async () => {
  useAuthStore.setState({
    user: {
      id: "user-1",
      username: "alice",
      nickname: null,
      avatarUrl: null,
      email: null,
      phone: null,
      wechatOpenId: null,
      alipayUserId: null,
      isAuditor: false
    },
    accessToken: "expired-token",
    refreshToken: null
  });
  const redirects: string[] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: {
        pathname: "/dashboard",
        assign: (path: string) => redirects.push(path)
      }
    }
  });
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).endsWith("/auth/refresh")) {
      return {
        ok: false,
        status: 401,
        json: async () => ({ code: "UNAUTHORIZED", message: "Unauthorized" })
      } as Response;
    }
    return {
      ok: false,
      status: 401,
      json: async () => ({ code: "UNAUTHORIZED", message: "Unauthorized" })
    } as Response;
  }) as typeof fetch;

  await assert.rejects(() => request<{ success: boolean }>("/test"), {
    name: "ApiError",
    status: 401
  });

  assert.deepEqual(redirects, ["/auth"]);
  assert.equal(useAuthStore.getState().user, null);
  assert.equal(useAuthStore.getState().accessToken, null);
});
