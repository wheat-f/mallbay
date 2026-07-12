import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RebatesController } from "./rebates.controller";
import { RebatesService } from "./rebates.service";

@Module({
  imports: [PrismaModule],
  controllers: [RebatesController],
  providers: [RebatesService],
  exports: [RebatesService]
})
export class RebatesModule {}
