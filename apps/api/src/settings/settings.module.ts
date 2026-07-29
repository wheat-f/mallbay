import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { DictionariesController } from "./dictionaries.controller";
import { DictionariesService } from "./dictionaries.service";
import { SettingsController } from "./settings.controller";
import { SettingsAccessService } from "./settings-access.service";
import { ConfigVersionsController } from "./config-versions.controller";
import { ConfigVersionsService } from "./config-versions.service";
import { SettingsAuditController } from "./audit.controller";
import { SettingsAuditService } from "./audit.service";
import { DictionaryTemplatesController } from "./dictionary-templates.controller";
import { DictionaryTemplatesService } from "./dictionary-templates.service";
import { OssConnectionController } from "./oss-connection.controller";
import { OssConnectionService } from "./oss-connection.service";
import { SettingsMigrationReviewsController } from "./migration-reviews.controller";
import { SettingsMigrationReviewsService } from "./migration-reviews.service";

@Module({ imports: [PrismaModule], controllers: [DictionariesController, SettingsController, ConfigVersionsController, SettingsAuditController, DictionaryTemplatesController, OssConnectionController, SettingsMigrationReviewsController], providers: [DictionariesService, SettingsAccessService, ConfigVersionsService, SettingsAuditService, DictionaryTemplatesService, OssConnectionService, SettingsMigrationReviewsService], exports: [DictionariesService, SettingsAccessService] })
export class SettingsModule {}