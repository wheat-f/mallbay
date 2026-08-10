import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CommissionsController } from "./commissions.controller";
import { CommissionsService } from "./commissions.service";
import { FinanceModule } from "../finance/finance.module";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PrismaModule, FinanceModule, PermissionsModule],
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService]
})
export class CommissionsModule {}
