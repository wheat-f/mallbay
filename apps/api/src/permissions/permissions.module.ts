import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsController } from "./permissions.controller";
import { PermissionsService } from "./permissions.service";
import { PermissionsInterceptor } from "./permissions.interceptor";
import { AccessContext } from "./domain/access-context";

@Module({
  imports: [PrismaModule],
  controllers: [PermissionsController],
  providers: [PermissionsService, AccessContext, { provide: APP_INTERCEPTOR, useClass: PermissionsInterceptor }],
  exports: [PermissionsService, AccessContext]
})
export class PermissionsModule {}
