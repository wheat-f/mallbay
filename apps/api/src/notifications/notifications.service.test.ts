import assert from "node:assert/strict";
import { test } from "node:test";
import { NotificationsService } from "./notifications.service";

test("list caps pageSize at 100", async () => {
  let capturedTake = 0;
  const prisma = {
    notification: {
      count: async () => 0,
      findMany: async (args: { take: number }) => {
        capturedTake = args.take;
        return [];
      }
    }
  };
  const service = new NotificationsService(prisma as never);

  await service.list("user-1", 1, 500);

  assert.equal(capturedTake, 100);
});

