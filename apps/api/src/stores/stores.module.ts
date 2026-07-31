import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { SettingsModule } from "../settings/settings.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { ObservabilityModule } from "../observability/observability.module";
import { UsersModule } from "../users/users.module";
import { StoresController } from "./stores.controller";
import { StoreRepository } from "./repositories/store.repository";
import { StoresService } from "./stores.service";
import { ChangeStoreManagerUseCase } from "./use-cases/change-store-manager.use-case";
import { ReviewStoreSubmissionUseCase } from "./use-cases/review-store-submission.use-case";
import { SetStoreFrozenUseCase } from "./use-cases/set-store-frozen.use-case";
import { SubmitStoreForReviewUseCase } from "./use-cases/submit-store-for-review.use-case";

@Module({
  imports: [PrismaModule, PermissionsModule, SettingsModule, NotificationsModule, UsersModule, ObservabilityModule],
  controllers: [StoresController],
  providers: [
    StoresService,
    StoreRepository,
    ReviewStoreSubmissionUseCase,
    SubmitStoreForReviewUseCase,
    ChangeStoreManagerUseCase,
    SetStoreFrozenUseCase
  ],
  exports: [StoresService]
})
export class StoresModule {}
