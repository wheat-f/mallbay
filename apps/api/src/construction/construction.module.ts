import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { ConstructionController } from "./construction.controller";
import { ConstructionService } from "./construction.service";
import { CapacityReservationService } from "./capacity-reservation.service";
import { ObservabilityModule } from "../observability/observability.module";

@Module({
  imports: [PrismaModule, UsersModule, ObservabilityModule],
  controllers: [ConstructionController],
  providers: [ConstructionService, CapacityReservationService],
  exports: [ConstructionService, CapacityReservationService]
})
export class ConstructionModule {}
