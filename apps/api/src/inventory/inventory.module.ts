import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryLedger } from "./domain/inventory-ledger";

@Module({
  imports: [PrismaModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryLedger],
  exports: [InventoryService, InventoryLedger]
})
export class InventoryModule {}
