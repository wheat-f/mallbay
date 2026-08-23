import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { AfterSalesController } from "./after-sales.controller";
import { AfterSalesService } from "./after-sales.service";
import { PermissionsModule } from "../permissions/permissions.module";
import { AFTER_SALES_READ_MODEL, AFTER_SALES_RESOLUTION } from "./domain/after-sales-resolution";

@Module({
  imports: [PrismaModule, UsersModule, PermissionsModule],
  controllers: [AfterSalesController],
  providers: [AfterSalesService,
    { provide: AFTER_SALES_RESOLUTION, useExisting: AfterSalesService },
    { provide: AFTER_SALES_READ_MODEL, useExisting: AfterSalesService }],
  exports: [AFTER_SALES_RESOLUTION, AFTER_SALES_READ_MODEL]
})
export class AfterSalesModule {}
