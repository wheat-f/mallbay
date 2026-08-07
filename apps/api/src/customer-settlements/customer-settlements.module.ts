import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import {
  CustomerReceiptsController,
  CustomerStatementsController
} from "./customer-settlements.controller";
import { CustomerSettlementsService } from "./customer-settlements.service";
import { SettlementView } from "./domain/settlement-view";

@Module({
  imports: [PrismaModule],
  controllers: [CustomerStatementsController, CustomerReceiptsController],
  providers: [CustomerSettlementsService, SettlementView],
  exports: [CustomerSettlementsService, SettlementView]
})
export class CustomerSettlementsModule {}
