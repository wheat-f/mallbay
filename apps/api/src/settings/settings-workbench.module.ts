import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { SettingsController } from "./settings.controller";
import { SettingsAccessService } from "./settings-access.service";

@Module({ imports: [PrismaModule], controllers: [SettingsController], providers: [SettingsAccessService] })
export class SettingsWorkbenchModule {}
