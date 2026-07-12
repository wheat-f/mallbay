import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { PrismaService } from "../prisma/prisma.service";
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

test("NotificationsService receives PrismaService through Nest injection", async () => {
  const prisma = {
    notification: {
      count: async () => 3
    }
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: PrismaService, useValue: prisma }
    ]
  }).compile();

  const service = moduleRef.get(NotificationsService);
  const result = await service.unreadCount("user-1");

  assert.deepEqual(result, { count: 3 });
});
