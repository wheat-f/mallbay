import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { UsersModule } from "../users/users.module";
import { StoresController } from "./stores.controller";
import { StoresService } from "./stores.service";
import { ReviewStoreSubmissionUseCase } from "./use-cases/review-store-submission.use-case";
import { SubmitStoreForReviewUseCase } from "./use-cases/submit-store-for-review.use-case";

@Module({
  imports: [PrismaModule, NotificationsModule, UsersModule],
  controllers: [StoresController],
  providers: [StoresService, ReviewStoreSubmissionUseCase, SubmitStoreForReviewUseCase],
  exports: [StoresService]
})
export class StoresModule {}
