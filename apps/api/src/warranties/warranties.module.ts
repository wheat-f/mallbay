import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { WarrantiesController } from "./warranties.controller";
import { WarrantiesService } from "./warranties.service";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [WarrantiesController],
  providers: [WarrantiesService],
  exports: [WarrantiesService]
})
export class WarrantiesModule {}
