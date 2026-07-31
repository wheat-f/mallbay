import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";
import { PermissionsInterceptor } from "./permissions.interceptor";

@Module({
  imports: [PrismaModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, { provide: APP_INTERCEPTOR, useClass: PermissionsInterceptor }],
  exports: [PermissionsService]
})
export class PermissionsModule {}
