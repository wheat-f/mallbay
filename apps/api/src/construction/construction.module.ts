import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { UsersModule } from "../users/users.module";
import { ConstructionController } from "./construction.controller";
import { ConstructionService } from "./construction.service";
import { CapacityReservationService } from "./capacity-reservation.service";
import { ConstructionCostSettlementService } from "./construction-cost-settlement.service";
import { CrossStoreConstructionService } from "./cross-store-construction.service";
import { ObservabilityModule } from "../observability/observability.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";
import { ConstructionFulfillment } from "./construction-fulfillment";
import { InventoryModule } from "../inventory/inventory.module";
import { CONSTRUCTION_MANAGEMENT } from "./domain/construction-management";

@Module({
  imports: [PrismaModule, PermissionsModule, UsersModule, ObservabilityModule, NotificationsModule, OrdersModule, InventoryModule],
  controllers: [ConstructionController],
  providers: [ConstructionService, CapacityReservationService, ConstructionCostSettlementService, CrossStoreConstructionService, ConstructionFulfillment,
    { provide: CONSTRUCTION_MANAGEMENT, useExisting: ConstructionService }],
  exports: [CapacityReservationService, ConstructionCostSettlementService, ConstructionFulfillment, CONSTRUCTION_MANAGEMENT]
})
export class ConstructionModule {}
