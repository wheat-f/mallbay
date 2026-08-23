import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { InventoryController } from "./inventory.controller";
import { InventoryService } from "./inventory.service";
import { InventoryImplementation } from "./inventory-implementation";
import { InventoryLedger } from "./domain/inventory-ledger";
import { ProcurementFlow } from "./procurement-flow";
import { InventoryCatalog } from "./inventory-catalog";
import { ProcurementImplementation } from "./procurement-implementation";

@Module({
  imports: [PrismaModule, PermissionsModule],
  controllers: [InventoryController],
  providers: [InventoryImplementation, InventoryService, InventoryLedger, ProcurementImplementation, ProcurementFlow, InventoryCatalog],
  exports: [InventoryLedger, ProcurementFlow, InventoryCatalog]
})
export class InventoryModule {}
