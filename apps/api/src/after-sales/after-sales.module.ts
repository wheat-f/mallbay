import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { AfterSalesController } from "./after-sales.controller";
import { AfterSalesService } from "./after-sales.service";

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [AfterSalesController],
  providers: [AfterSalesService],
  exports: [AfterSalesService]
})
export class AfterSalesModule {}
