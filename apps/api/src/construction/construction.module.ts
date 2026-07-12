import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { UsersModule } from "../users/users.module";
import { ConstructionController } from "./construction.controller";
import { ConstructionService } from "./construction.service";

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [ConstructionController],
  providers: [ConstructionService],
  exports: [ConstructionService]
})
export class ConstructionModule {}
