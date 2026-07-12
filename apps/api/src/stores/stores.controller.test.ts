import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { StoresController } from "./stores.controller";
import { MetricsService } from "../observability/metrics.service";
import { OssService } from "../users/oss.service";
import { StoresService } from "./stores.service";
import type { MulterFile } from "../users/multer-file.type";

const imageFile = {
  originalname: "store.jpg",
  mimetype: "image/jpeg",
  buffer: Buffer.from("image")
} as MulterFile;

test("uploadStorePhoto verifies manager permission before uploading through injected OSS service", async () => {
  const calls: string[] = [];
  const storesService = {
    assertStoreManager: async (userId: string, storeId: string) => {
      calls.push(`assert:${userId}:${storeId}`);
    }
  };
  const ossService = {
    uploadStorePhoto: async (storeId: string, file: MulterFile) => {
      calls.push(`upload:${storeId}:${file.originalname}`);
      return "https://cdn.mallbay.test/store.jpg";
    }
  };
  const controller = new StoresController(storesService as never, ossService as never, {} as never);

  const result = await controller.uploadStorePhoto(
    { user: { id: "user-1", username: "manager", isAuditor: false } } as never,
    "store-1",
    imageFile
  );

  assert.deepEqual(calls, ["assert:user-1:store-1", "upload:store-1:store.jpg"]);
  assert.deepEqual(result, { url: "https://cdn.mallbay.test/store.jpg" });
});

test("uploadStorePhoto increments upload failure metric when OSS upload fails", async () => {
  const increments: Array<{ name: string; labels: Record<string, string> }> = [];
  const storesService = {
    assertStoreManager: async () => undefined
  };
  const ossService = {
    uploadStorePhoto: async () => {
      throw new Error("oss unavailable");
    }
  };
  const metrics = {
    increment: (name: string, labels: Record<string, string>) => {
      increments.push({ name, labels });
    }
  };
  const controller = new StoresController(storesService as never, ossService as never, metrics as never);

  await assert.rejects(
    () =>
      controller.uploadStorePhoto(
        { user: { id: "user-1", username: "manager", isAuditor: false } } as never,
        "store-1",
        imageFile
      ),
    /oss unavailable/
  );

  assert.deepEqual(increments, [
    {
      name: "upload_failures_total",
      labels: { target: "store_photo" }
    }
  ]);
});

test("StoresController receives StoresService through Nest injection", async () => {
  const storesService = {
    getWorkbenchStore: async (userId: string, storeId: string) => ({ userId, storeId })
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [StoresController],
    providers: [
      { provide: StoresService, useValue: storesService },
      { provide: OssService, useValue: {} },
      { provide: MetricsService, useValue: { increment: () => undefined } }
    ]
  }).compile();

  const controller = moduleRef.get(StoresController);
  const result = await controller.getWorkbenchStore(
    { user: { id: "user-1", username: "manager", isAuditor: false } } as never,
    "store-1"
  );

  assert.deepEqual(result, { userId: "user-1", storeId: "store-1" });
});
