import assert from "node:assert/strict";
import { test } from "node:test";
import { StoresController } from "./stores.controller";
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
  const controller = new StoresController(storesService as never, ossService as never);

  const result = await controller.uploadStorePhoto(
    { user: { id: "user-1", username: "manager", isAuditor: false } } as never,
    "store-1",
    imageFile
  );

  assert.deepEqual(calls, ["assert:user-1:store-1", "upload:store-1:store.jpg"]);
  assert.deepEqual(result, { url: "https://cdn.mallbay.test/store.jpg" });
});

