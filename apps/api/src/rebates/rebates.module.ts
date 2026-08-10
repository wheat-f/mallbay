import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RebatesController } from "./rebates.controller";
import { RebatesService } from "./rebates.service";
import { FinanceModule } from "../finance/finance.module";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PrismaModule, FinanceModule, PermissionsModule],
  controllers: [RebatesController],
  providers: [RebatesService],
  exports: [RebatesService]
})
export class RebatesModule {}
