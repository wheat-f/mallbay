import { Module } from "@nestjs/common";
import { OrdersController, PaymentAccountsController } from "./orders.controller";
import { OrderLifecycleClientEventsController } from "./order-lifecycle-client-events.controller";
import { OrdersService } from "./orders.service";
import { OrderRepository } from "./repositories/order.repository";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";
import { OrderLifecycle } from "./domain/order-lifecycle";
import { ObservabilityModule } from "../observability/observability.module";
import { PricingModule } from "../pricing/pricing.module";
import { PermissionsModule } from "../permissions/permissions.module";
import { ConstructionLifecycleImplementation } from "./implementation/construction-lifecycle.implementation";
import { OrderLifecycleReconciliationService } from "./order-lifecycle-reconciliation.service";

@Module({
  imports: [ObservabilityModule, PricingModule, PermissionsModule],
  controllers: [OrdersController, PaymentAccountsController, OrderLifecycleClientEventsController],
  providers: [OrdersService, OrderRepository, CreateOrderUseCase, ConstructionLifecycleImplementation, OrderLifecycle, OrderLifecycleReconciliationService],
  exports: [OrdersService, OrderLifecycle]
})
export class OrdersModule {}
