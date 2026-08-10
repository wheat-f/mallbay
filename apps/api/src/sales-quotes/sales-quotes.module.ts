import { Module } from "@nestjs/common";
import { SalesQuotesController } from "./sales-quotes.controller";
import { SalesQuotesService } from "./sales-quotes.service";
import { SalesQuoteExpiryScheduler } from "./sales-quote-expiry.scheduler";
import { ConstructionModule } from "../construction/construction.module";
import { OrdersModule } from "../orders/orders.module";
import { ObservabilityModule } from "../observability/observability.module";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [ConstructionModule, OrdersModule, ObservabilityModule, PermissionsModule],
  controllers: [SalesQuotesController],
  providers: [SalesQuotesService, SalesQuoteExpiryScheduler],
  exports: [SalesQuotesService]
})
export class SalesQuotesModule {}
