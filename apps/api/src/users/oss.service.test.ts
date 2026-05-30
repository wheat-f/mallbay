import assert from "node:assert/strict";
import { test } from "node:test";
import { OssService } from "./oss.service";
import type { MulterFile } from "./multer-file.type";

const imageFile = {
  originalname: "avatar.jpg",
  mimetype: "image/jpeg",
  buffer: Buffer.from("image")
} as MulterFile;

test("OssService traces avatar uploads without logging credentials", async () => {
  const traceCalls: unknown[] = [];
  const service = new OssService({
    traceOperation: async (operation: string, fields: Record<string, unknown>, callback: () => Promise<string>) => {
      traceCalls.push({ operation, fields });
      return callback();
    }
  } as never);

  service["getClient"] = () => ({
    client: {
      put: async () => undefined
    },
    bucket: "mallbay-bucket",
    region: "oss-cn-shanghai"
  });

  const url = await service.uploadAvatar("user-1", imageFile);

  assert.match(url, /^https:\/\/mallbay-bucket\.oss-cn-shanghai\.aliyuncs\.com\/avatars\/user-1\//);
  assert.deepEqual(traceCalls, [
    {
      operation: "oss.upload",
      fields: {
        component: "oss",
        target: "avatar",
        userId: "user-1",
        bytes: imageFile.buffer.length
      }
    }
  ]);
});

test("OssService traces store photo uploads", async () => {
  const traceCalls: unknown[] = [];
  const service = new OssService({
    traceOperation: async (operation: string, fields: Record<string, unknown>, callback: () => Promise<string>) => {
      traceCalls.push({ operation, fields });
      return callback();
    }
  } as never);

  service["getClient"] = () => ({
    client: {
      put: async () => undefined
    },
    bucket: "mallbay-bucket",
    region: "oss-cn-shanghai"
  });

  await service.uploadStorePhoto("store-1", imageFile);

  assert.deepEqual(traceCalls, [
    {
      operation: "oss.upload",
      fields: {
        component: "oss",
        target: "store_photo",
        storeId: "store-1",
        bytes: imageFile.buffer.length
      }
    }
  ]);
});
