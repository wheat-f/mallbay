import { Module } from "@nestjs/common";
import { OrdersController, PaymentAccountsController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderRepository } from "./repositories/order.repository";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";
import { ObservabilityModule } from "../observability/observability.module";
import { PricingModule } from "../pricing/pricing.module";

@Module({
  imports: [ObservabilityModule, PricingModule],
  controllers: [OrdersController, PaymentAccountsController],
  providers: [OrdersService, OrderRepository, CreateOrderUseCase],
  exports: [OrdersService, CreateOrderUseCase]
})
export class OrdersModule {}
