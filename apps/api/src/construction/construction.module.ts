import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { ConstructionController } from "./construction.controller";
import { ConstructionService } from "./construction.service";
import { CapacityReservationService } from "./capacity-reservation.service";
import { ConstructionCostSettlementService } from "./construction-cost-settlement.service";
import { CrossStoreConstructionService } from "./cross-store-construction.service";
import { ObservabilityModule } from "../observability/observability.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrdersModule } from "../orders/orders.module";

@Module({
  imports: [PrismaModule, UsersModule, ObservabilityModule, NotificationsModule, OrdersModule],
  controllers: [ConstructionController],
  providers: [ConstructionService, CapacityReservationService, ConstructionCostSettlementService, CrossStoreConstructionService],
  exports: [ConstructionService, CapacityReservationService, ConstructionCostSettlementService, CrossStoreConstructionService]
})
export class ConstructionModule {}
