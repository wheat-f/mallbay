import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import {
  CustomerReceiptsController,
  CustomerStatementsController
} from "./customer-settlements.controller";
import { SettlementExecutionImplementation } from "./settlement-execution-implementation";
import { SettlementQueryImplementation } from "./settlement-query-implementation";
import { SettlementView } from "./domain/settlement-view";
import { FinanceModule } from "../finance/finance.module";
import { SettlementWorkflow } from "./domain/settlement-workflow";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PrismaModule, FinanceModule, PermissionsModule],
  controllers: [CustomerStatementsController, CustomerReceiptsController],
  providers: [SettlementExecutionImplementation, SettlementQueryImplementation, SettlementView, SettlementWorkflow],
  exports: [SettlementView, SettlementWorkflow]
})
export class CustomerSettlementsModule {}
