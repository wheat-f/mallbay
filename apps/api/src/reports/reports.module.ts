import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { PermissionsModule } from "../permissions/permissions.module";
import { OPERATIONAL_REPORT } from "./domain/operational-report";

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [ReportsController],
  providers: [ReportsService, { provide: OPERATIONAL_REPORT, useExisting: ReportsService }],
  exports: [OPERATIONAL_REPORT]
})
export class ReportsModule {}
