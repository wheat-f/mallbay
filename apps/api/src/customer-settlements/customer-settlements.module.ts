import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import {
  CustomerReceiptsController,
  CustomerStatementsController
} from "./customer-settlements.controller";
import { CustomerSettlementsService } from "./customer-settlements.service";

@Module({
  imports: [PrismaModule],
  controllers: [CustomerStatementsController, CustomerReceiptsController],
  providers: [CustomerSettlementsService],
  exports: [CustomerSettlementsService]
})
export class CustomerSettlementsModule {}
