import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AfterSalesController } from "./after-sales.controller";
import { AfterSalesService } from "./after-sales.service";

@Module({
  imports: [PrismaModule],
  controllers: [AfterSalesController],
  providers: [AfterSalesService],
  exports: [AfterSalesService]
})
export class AfterSalesModule {}
