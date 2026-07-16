import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { ConstructionController } from "./construction.controller";
import { ConstructionService } from "./construction.service";
import { CapacityReservationService } from "./capacity-reservation.service";
import { ConstructionCostSettlementService } from "./construction-cost-settlement.service";
import { ObservabilityModule } from "../observability/observability.module";

@Module({
  imports: [PrismaModule, UsersModule, ObservabilityModule],
  controllers: [ConstructionController],
  providers: [ConstructionService, CapacityReservationService, ConstructionCostSettlementService],
  exports: [ConstructionService, CapacityReservationService, ConstructionCostSettlementService]
})
export class ConstructionModule {}
