import { Module } from "@nestjs/common";
import { OrdersController, PaymentAccountsController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderRepository } from "./repositories/order.repository";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";
import { OrderLifecycle } from "./domain/order-lifecycle";
import { ObservabilityModule } from "../observability/observability.module";
import { PricingModule } from "../pricing/pricing.module";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [ObservabilityModule, PricingModule, PermissionsModule],
  controllers: [OrdersController, PaymentAccountsController],
  providers: [OrdersService, OrderRepository, CreateOrderUseCase, OrderLifecycle],
  exports: [OrdersService, CreateOrderUseCase, OrderLifecycle]
})
export class OrdersModule {}
