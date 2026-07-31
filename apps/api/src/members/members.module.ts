import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";

@Module({
  imports: [PrismaModule, NotificationsModule, PermissionsModule],
  controllers: [MembersController],
  providers: [MembersService]
})
export class MembersModule {}
