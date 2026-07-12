import { Module } from "@nestjs/common";
import { InventoryModule } from "../inventory/inventory.module";
import { PurchasesController } from "./purchases.controller";

@Module({
  imports: [InventoryModule],
  controllers: [PurchasesController]
})
export class PurchasesModule {}
