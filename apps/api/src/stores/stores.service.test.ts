import assert from "node:assert/strict";
import { test } from "node:test";
import { StoresService } from "./stores.service";

test("listPublishedStores caps pageSize at 100", async () => {
  let capturedTake = 0;
  const prisma = {
    store: {
      count: async () => 0,
      findMany: async (args: { take: number }) => {
        capturedTake = args.take;
        return [];
      }
    }
  };
  const service = new StoresService(prisma as never, {} as never);

  await service.listPublishedStores({ page: 1, pageSize: 500 });

  assert.equal(capturedTake, 100);
});

