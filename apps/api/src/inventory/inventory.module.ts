import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryLedger } from "./domain/inventory-ledger";
import { ProcurementFlow } from "./procurement-flow";
import { InventoryCatalog } from "./inventory-catalog";

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryLedger, ProcurementFlow, InventoryCatalog],
  exports: [InventoryLedger, ProcurementFlow, InventoryCatalog]
})
export class InventoryModule {}
