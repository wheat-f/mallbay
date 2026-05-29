import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useAuthStore } from "../stores/auth-store";
import { request } from "./request";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  useAuthStore.setState({ accessToken: null });
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
  assert.deepEqual(capturedInit?.headers, {
    "Content-Type": "application/json",
    Authorization: "Bearer access-token"
  });
});
