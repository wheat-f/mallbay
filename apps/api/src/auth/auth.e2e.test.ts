import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ValidationPipe } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { constants, publicEncrypt } from "crypto";
import { ApiExceptionFilter } from "../common/api-exception.filter";
import { PrismaModule } from "../prisma/prisma.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuthModule } from "./auth.module";
import { REFRESH_TOKEN_COOKIE_NAME } from "./auth.controller";

const jwtConfig = {
  JWT_ACCESS_SECRET: "test-access-secret",
  JWT_REFRESH_SECRET: "test-refresh-secret",
  JWT_ACCESS_EXPIRES_IN: "15m",
  JWT_REFRESH_EXPIRES_IN: "7d"
};

const plaintextCredentialConfig = {
  ...jwtConfig,
  AUTH_CREDENTIAL_ENCRYPTION_ENABLED: "false"
};

type TestUser = {
  id: string;
  username: string;
  passwordHash: string;
  refreshTokenHash: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  wechatOpenId: string | null;
  alipayUserId: string | null;
  isAuditor: boolean;
};

const openApps: { close: () => Promise<void> }[] = [];

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()));
});

test("auth refresh rotates cookie and logout invalidates the refresh session over HTTP", async () => {
  const users = new Map<string, TestUser>();
  const prisma = createPrismaStub(users);
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => plaintextCredentialConfig]
      }),
      PrismaModule,
      AuthModule
    ]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  openApps.push(app);
  const url = await app.getUrl();

  const registerResponse = await fetch(`${url}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "mallbay", password: "password-123" })
  });
  const registerBody = await registerResponse.json();

  assert.equal(registerResponse.status, 201, JSON.stringify(registerBody));
  const registerCookie = getSetCookie(registerResponse);
  assert.equal(typeof registerBody.accessToken, "string");
  assert.match(registerCookie, new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(registerCookie, /HttpOnly/i);

  const refreshResponse = await fetch(`${url}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: getCookieHeader(registerCookie)
    },
    body: JSON.stringify({})
  });
  const refreshBody = await refreshResponse.json();

  assert.equal(refreshResponse.status, 201, JSON.stringify(refreshBody));
  const refreshCookie = getSetCookie(refreshResponse);
  assert.equal(typeof refreshBody.accessToken, "string");
  assert.match(refreshCookie, new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.notEqual(getCookieHeader(refreshCookie), getCookieHeader(registerCookie));

  const logoutResponse = await fetch(`${url}/auth/logout`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${refreshBody.accessToken}`
    }
  });
  const logoutBody = await logoutResponse.json();

  assert.equal(logoutResponse.status, 201, JSON.stringify(logoutBody));
  const logoutCookie = getSetCookie(logoutResponse);
  assert.match(logoutCookie, new RegExp(`${REFRESH_TOKEN_COOKIE_NAME}=`));
  assert.match(logoutCookie, /Expires=Thu, 01 Jan 1970 00:00:00 GMT/i);

  const refreshAfterLogoutResponse = await fetch(`${url}/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: getCookieHeader(refreshCookie)
    },
    body: JSON.stringify({})
  });

  assert.equal(refreshAfterLogoutResponse.status, 401);
});

test("auth accepts encrypted credentials over HTTP", async () => {
  const users = new Map<string, TestUser>();
  const prisma = createPrismaStub(users);
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [() => jwtConfig]
      }),
      PrismaModule,
      AuthModule
    ]
  })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  await app.listen(0, "127.0.0.1");
  openApps.push(app);
  const url = await app.getUrl();

  const publicKeyResponse = await fetch(`${url}/auth/public-key`);
  const publicKey = await publicKeyResponse.json() as { publicKey: string };
  const encryptedPassword = encryptPassword(publicKey.publicKey, "Test1234!");

  const registerResponse = await fetch(`${url}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "encrypted-user", encryptedPassword })
  });
  const registerBody = await registerResponse.json();

  assert.equal(registerResponse.status, 201, JSON.stringify(registerBody));
  assert.equal(typeof registerBody.accessToken, "string");

  const loginResponse = await fetch(`${url}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identifier: "encrypted-user",
      encryptedPassword: encryptPassword(publicKey.publicKey, "Test1234!")
    })
  });
  const loginBody = await loginResponse.json();

  assert.equal(loginResponse.status, 201, JSON.stringify(loginBody));
  assert.equal(typeof loginBody.accessToken, "string");
});

function createPrismaStub(users: Map<string, TestUser>) {
  const sessions = new Map<string, { id: string; userId: string; tokenHash: string; deviceName: string; userAgent: string | null; ipAddress: string | null; lastSeenAt: Date; createdAt: Date; revokedAt: Date | null }>();
  return {
    user: {
      findUnique: async ({ where }: { where: { id?: string; username?: string } }) => {
        if (where.id) {
          const user = users.get(where.id);
          return user ? { ...user, storeMembers: [] } : null;
        }
        if (where.username) {
          return Array.from(users.values()).find((user) => user.username === where.username) ?? null;
        }
        return null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const user = users.get(where.id);
        if (!user) {
          throw new Error("User not found");
        }
        return user;
      },
      findFirst: async ({
        where
      }: {
        where: { OR: { username?: string; email?: string; phone?: string }[] };
      }) => {
        const identifiers = where.OR.flatMap((condition) => [
          condition.username,
          condition.email,
          condition.phone
        ]).filter(Boolean);
        return (
          Array.from(users.values()).find((user) =>
            identifiers.some(
              (identifier) =>
                user.username === identifier || user.email === identifier || user.phone === identifier
            )
          ) ?? null
        );
      },
      create: async ({ data }: { data: { username: string; passwordHash: string } }) => {
        const user: TestUser = {
          id: "user-1",
          username: data.username,
          passwordHash: data.passwordHash,
          refreshTokenHash: null,
          nickname: null,
          avatarUrl: null,
          email: null,
          phone: null,
          wechatOpenId: null,
          alipayUserId: null,
          isAuditor: false
        };
        users.set(user.id, user);
        return user;
      },
      update: async ({
        where,
        data
      }: {
        where: { id: string };
        data: { refreshTokenHash: string | null };
      }) => {
        const user = users.get(where.id);
        if (!user) {
          throw new Error("User not found");
        }
        Object.assign(user, data);
        return user;
      }
    },
    settingsConfigVersion: {
      findFirst: async () => null
    },
    permissionRoleBinding: {
      findMany: async () => [],
      findFirst: async () => null
    },
    permissionPolicyVersion: {
      findFirst: async () => null
    },
    authSession: {
      findUnique: async ({ where }: { where: { id: string } }) => sessions.get(where.id) ?? null,
      findFirst: async ({ where }: { where: { id?: string; userId?: string; revokedAt?: null } }) => Array.from(sessions.values()).find((session) => (!where.id || session.id === where.id) && (!where.userId || session.userId === where.userId) && (where.revokedAt === undefined || session.revokedAt === where.revokedAt)) ?? null,
      findMany: async ({ where }: { where: { userId: string; revokedAt?: null } }) => Array.from(sessions.values()).filter((session) => session.userId === where.userId && (where.revokedAt === undefined || session.revokedAt === where.revokedAt)),
      create: async ({ data }: { data: { id: string; userId: string; tokenHash: string; deviceName: string; userAgent?: string; ipAddress?: string } }) => { const now = new Date(); const session = { id: data.id, userId: data.userId, tokenHash: data.tokenHash, deviceName: data.deviceName, userAgent: data.userAgent ?? null, ipAddress: data.ipAddress ?? null, lastSeenAt: now, createdAt: now, revokedAt: null }; sessions.set(session.id, session); return session; },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => { const session = sessions.get(where.id); if (!session) throw new Error("Session not found"); Object.assign(session, data); return session; },
      updateMany: async ({ where, data }: { where: { id?: string; userId?: string; revokedAt?: null }; data: Record<string, unknown> }) => { let count = 0; for (const session of sessions.values()) { if ((!where.id || session.id === where.id) && (!where.userId || session.userId === where.userId) && (where.revokedAt === undefined || session.revokedAt === where.revokedAt)) { Object.assign(session, data); count += 1; } } return { count }; }
    },
    $transaction: async (operations: Promise<unknown>[]) => Promise.all(operations),
    $connect: async () => undefined,
    $disconnect: async () => undefined
  };
}

function getSetCookie(response: Response) {
  const cookie = response.headers.get("set-cookie");
  assert.ok(cookie, "Expected response to include Set-Cookie header");
  return cookie;
}

function getCookieHeader(setCookie: string) {
  return setCookie.split(";")[0];
}

function encryptPassword(publicKey: string, password: string) {
  return publicEncrypt(
    {
      key: publicKey,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256"
    },
    Buffer.from(password)
  ).toString("base64");
}
