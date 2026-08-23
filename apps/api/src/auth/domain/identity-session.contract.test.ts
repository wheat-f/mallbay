import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { AuthController } from "../auth.controller";
import { AuthService } from "../auth.service";
import { IdentitySession } from "./identity-session";

test("IdentitySession exposes the identity and session lifecycle seam", () => {
  assert.deepEqual(
    Object.getOwnPropertyNames(IdentitySession.prototype)
      .filter((name) => name !== "constructor")
      .sort(),
    ["login", "logout", "me", "publicKey", "refresh", "register", "revokeSession", "sessions", "wechatLogin"].sort()
  );
});

test("IdentitySession delegates each public capability to AuthService", async () => {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const implementation = {
    getCredentialPublicKey: () => {
      calls.push({ name: "publicKey", args: [] });
      return { publicKey: "public-key" };
    },
    register: async (...args: unknown[]) => {
      calls.push({ name: "register", args });
      return "registered";
    },
    login: async (...args: unknown[]) => {
      calls.push({ name: "login", args });
      return "logged-in";
    },
    loginWithWechatCode: async (...args: unknown[]) => {
      calls.push({ name: "wechatLogin", args });
      return "wechat-logged-in";
    },
    refresh: async (...args: unknown[]) => {
      calls.push({ name: "refresh", args });
      return "refreshed";
    },
    me: async (...args: unknown[]) => {
      calls.push({ name: "me", args });
      return "me";
    },
    logout: async (...args: unknown[]) => {
      calls.push({ name: "logout", args });
      return "logged-out";
    },
    listSessions: async (...args: unknown[]) => {
      calls.push({ name: "sessions", args });
      return "sessions";
    },
    revokeSession: async (...args: unknown[]) => {
      calls.push({ name: "revokeSession", args });
      return "revoked";
    }
  };
  const seam = new IdentitySession(implementation as never);
  const context = { userAgent: "test-agent", ipAddress: "127.0.0.1" };

  assert.deepEqual(seam.publicKey(), { publicKey: "public-key" });
  assert.equal(await seam.register({ username: "user", password: "password" }, context), "registered");
  assert.equal(await seam.login({ identifier: "user", password: "password" }, context), "logged-in");
  assert.equal(await seam.wechatLogin({ code: "wechat-code" }, context), "wechat-logged-in");
  assert.equal(await seam.refresh("refresh-token", context), "refreshed");
  assert.equal(await seam.me("user-1"), "me");
  assert.equal(await seam.logout("user-1", "session-1"), "logged-out");
  assert.equal(await seam.sessions("user-1", "session-1"), "sessions");
  assert.equal(await seam.revokeSession("user-1", "session-2"), "revoked");

  assert.deepEqual(calls.map(({ name }) => name), [
    "publicKey",
    "register",
    "login",
    "wechatLogin",
    "refresh",
    "me",
    "logout",
    "sessions",
    "revokeSession"
  ]);
  assert.deepEqual(calls[1]?.args[1], context);
  assert.deepEqual(calls[3]?.args[1], context);
  assert.deepEqual(calls[5]?.args, ["user-1"]);
});

test("AuthController resolves through the IdentitySession seam", async () => {
  const seam = {
    publicKey: () => ({ publicKey: "seam-key" })
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [AuthController],
    providers: [{ provide: IdentitySession, useValue: seam }]
  }).compile();

  assert.deepEqual(moduleRef.get(AuthController).publicKey(), { publicKey: "seam-key" });
  assert.throws(() => moduleRef.get(AuthService), /Nest could not find/);

  await moduleRef.close();
});
