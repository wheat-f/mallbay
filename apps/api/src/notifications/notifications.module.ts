import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";
import { NotificationDispatcher } from "./notification-dispatcher";

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationDispatcher],
  exports: [NotificationsService, NotificationDispatcher]
})
export class NotificationsModule {}
