import assert from "node:assert/strict";
import { test } from "node:test";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
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

test("OssService stores uploads locally when OSS_PROVIDER is local", async () => {
  const previousProvider = process.env.OSS_PROVIDER;
  const previousLocalDir = process.env.OSS_LOCAL_DIR;
  const previousPublicBaseUrl = process.env.OSS_PUBLIC_BASE_URL;
  const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "mallbay-oss-"));
  process.env.OSS_PROVIDER = "local";
  process.env.OSS_LOCAL_DIR = localDir;
  process.env.OSS_PUBLIC_BASE_URL = "http://localhost:3001/local-oss";

  try {
    const service = new OssService();
    const url = await service.uploadAvatar("user-1", imageFile);
    const key = new URL(url).pathname.replace(/^\/local-oss\//, "");
    const stored = await fs.readFile(path.join(localDir, key));

    assert.match(url, /^http:\/\/localhost:3001\/local-oss\/avatars\/user-1\//);
    assert.deepEqual(stored, imageFile.buffer);
  } finally {
    process.env.OSS_PROVIDER = previousProvider;
    process.env.OSS_LOCAL_DIR = previousLocalDir;
    process.env.OSS_PUBLIC_BASE_URL = previousPublicBaseUrl;
    await fs.rm(localDir, { recursive: true, force: true });
  }
});

test("OssService stores after-sale photos under the after-sale namespace", async () => {
  const previousProvider = process.env.OSS_PROVIDER;
  const previousLocalDir = process.env.OSS_LOCAL_DIR;
  const previousPublicBaseUrl = process.env.OSS_PUBLIC_BASE_URL;
  const localDir = await fs.mkdtemp(path.join(os.tmpdir(), "mallbay-oss-after-sale-"));
  process.env.OSS_PROVIDER = "local";
  process.env.OSS_LOCAL_DIR = localDir;
  process.env.OSS_PUBLIC_BASE_URL = "http://localhost:3001/local-oss";

  try {
    const service = new OssService();
    const url = await service.uploadAfterSalePhoto("store-1", "after-sale-1", imageFile);
    const key = new URL(url).pathname.replace(/^\/local-oss\//, "");
    const stored = await fs.readFile(path.join(localDir, key));

    assert.match(url, /^http:\/\/localhost:3001\/local-oss\/after-sales\/store-1\/after-sale-1\//);
    assert.deepEqual(stored, imageFile.buffer);
  } finally {
    process.env.OSS_PROVIDER = previousProvider;
    process.env.OSS_LOCAL_DIR = previousLocalDir;
    process.env.OSS_PUBLIC_BASE_URL = previousPublicBaseUrl;
    await fs.rm(localDir, { recursive: true, force: true });
  }
});