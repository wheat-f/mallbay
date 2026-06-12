import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

test("NotificationsController receives NotificationsService through Nest injection", async () => {
  const notificationsService = {
    unreadCount: async (userId: string) => ({ unreadCount: userId === "user-1" ? 2 : 0 })
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [NotificationsController],
    providers: [{ provide: NotificationsService, useValue: notificationsService }]
  }).compile();

  const controller = moduleRef.get(NotificationsController);
  const result = await controller.unreadCount({ user: { id: "user-1" } } as never);

  assert.deepEqual(result, { unreadCount: 2 });
});
