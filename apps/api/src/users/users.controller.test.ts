import assert from "node:assert/strict";
import { test } from "node:test";
import { UsersController } from "./users.controller";
import type { MulterFile } from "./multer-file.type";

const imageFile = {
  originalname: "avatar.jpg",
  mimetype: "image/jpeg",
  buffer: Buffer.from("image")
} as MulterFile;

test("searchUsers delegates auditor user search to UsersService", async () => {
  const calls: unknown[] = [];
  const usersService = {
    searchUsers: async (userId: string, isAuditor: boolean, keyword: string) => {
      calls.push({ userId, isAuditor, keyword });
      return [{ id: "user-2", username: "xiaoming" }];
    }
  };
  const controller = new UsersController(usersService as never, {} as never, {} as never);

  const result = await controller.searchUsers(
    { user: { id: "auditor-1", username: "admin", isAuditor: true } } as never,
    "xiao"
  );

  assert.deepEqual(calls, [{ userId: "auditor-1", isAuditor: true, keyword: "xiao" }]);
  assert.deepEqual(result, [{ id: "user-2", username: "xiaoming" }]);
});

test("uploadAvatar uploads through injected OSS service before updating profile avatar", async () => {
  const calls: string[] = [];
  const usersService = {
    updateAvatar: async (userId: string, avatarUrl: string) => {
      calls.push(`update:${userId}:${avatarUrl}`);
      return { id: userId, avatarUrl };
    }
  };
  const ossService = {
    uploadAvatar: async (userId: string, file: MulterFile) => {
      calls.push(`upload:${userId}:${file.originalname}`);
      return "https://cdn.mallbay.test/avatar.jpg";
    }
  };
  const controller = new UsersController(usersService as never, ossService as never, {} as never);

  const result = await controller.uploadAvatar(
    { user: { id: "user-1", username: "owner", isAuditor: false } } as never,
    imageFile
  );

  assert.deepEqual(calls, [
    "upload:user-1:avatar.jpg",
    "update:user-1:https://cdn.mallbay.test/avatar.jpg"
  ]);
  assert.deepEqual(result, {
    id: "user-1",
    avatarUrl: "https://cdn.mallbay.test/avatar.jpg"
  });
});

test("uploadAvatar increments upload failure metric when OSS upload fails", async () => {
  const increments: Array<{ name: string; labels: Record<string, string> }> = [];
  const usersService = {};
  const ossService = {
    uploadAvatar: async () => {
      throw new Error("oss unavailable");
    }
  };
  const metrics = {
    increment: (name: string, labels: Record<string, string>) => {
      increments.push({ name, labels });
    }
  };
  const controller = new UsersController(usersService as never, ossService as never, metrics as never);

  await assert.rejects(
    () =>
      controller.uploadAvatar(
        { user: { id: "user-1", username: "owner", isAuditor: false } } as never,
        imageFile
      ),
    /oss unavailable/
  );

  assert.deepEqual(increments, [
    {
      name: "upload_failures_total",
      labels: { target: "avatar" }
    }
  ]);
});
