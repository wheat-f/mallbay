import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import {
  CustomerReceiptsController,
  CustomerStatementsController
} from "./customer-settlements.controller";
import { CustomerSettlementsService } from "./customer-settlements.service";
import { SettlementView } from "./domain/settlement-view";
import { FinanceModule } from "../finance/finance.module";
import { SettlementWorkflow } from "./domain/settlement-workflow";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PrismaModule, FinanceModule, PermissionsModule],
  controllers: [CustomerStatementsController, CustomerReceiptsController],
  providers: [CustomerSettlementsService, SettlementView, SettlementWorkflow],
  exports: [SettlementView, SettlementWorkflow]
})
export class CustomerSettlementsModule {}
