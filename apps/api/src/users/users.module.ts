import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { AuthModule } from "../auth/auth.module";
import { ObservabilityModule } from "../observability/observability.module";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { OssService } from "./oss.service";

@Module({
  imports: [PrismaModule, PermissionsModule, AuthModule, ObservabilityModule],
  controllers: [UsersController],
  providers: [UsersService, OssService],
  exports: [UsersService, OssService]
})
export class UsersModule {}
