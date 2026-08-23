import { Module } from "@nestjs/common";
import { ReturnsController } from "./returns.controller";
import { ReturnsWorkflow } from "./returns.service";
import { PermissionsModule } from "../permissions/permissions.module";
import { FinanceModule } from "../finance/finance.module";
import { InventoryModule } from "../inventory/inventory.module";

@Module({ imports: [PermissionsModule, FinanceModule, InventoryModule], controllers: [ReturnsController], providers: [ReturnsWorkflow], exports: [ReturnsWorkflow] })
export class ReturnsModule {}
