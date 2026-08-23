import { Module } from "@nestjs/common";
import { SalesQuotesController } from "./sales-quotes.controller";
import { SalesQuotesService } from "./sales-quotes.service";
import { SalesQuoteExpiryScheduler } from "./sales-quote-expiry.scheduler";
import { ConstructionModule } from "../construction/construction.module";
import { OrdersModule } from "../orders/orders.module";
import { ObservabilityModule } from "../observability/observability.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { QUOTE_READ_MODEL, QUOTE_WORKFLOW } from "./domain/quote-workflow";

@Module({
  imports: [ConstructionModule, OrdersModule, ObservabilityModule, PermissionsModule],
  controllers: [SalesQuotesController],
  providers: [
    SalesQuotesService,
    SalesQuoteExpiryScheduler,
    { provide: QUOTE_WORKFLOW, useExisting: SalesQuotesService },
    { provide: QUOTE_READ_MODEL, useExisting: SalesQuotesService }
  ],
  exports: [QUOTE_WORKFLOW, QUOTE_READ_MODEL]
})
export class SalesQuotesModule {}
