import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CommissionsController } from "./commissions.controller";
import { CommissionsService } from "./commissions.service";

@Module({
  imports: [PrismaModule],
  controllers: [CommissionsController],
  providers: [CommissionsService],
  exports: [CommissionsService]
})
export class CommissionsModule {}
