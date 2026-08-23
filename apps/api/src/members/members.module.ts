import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { MembersController } from "./members.controller";
import { MembersService } from "./members.service";
import { MEMBER_INVITATION_WORKFLOW } from "./domain/member-invitation-workflow";

@Module({
  imports: [PrismaModule, NotificationsModule, PermissionsModule],
  controllers: [MembersController],
  providers: [MembersService, { provide: MEMBER_INVITATION_WORKFLOW, useExisting: MembersService }],
  exports: [MEMBER_INVITATION_WORKFLOW]
})
export class MembersModule {}
