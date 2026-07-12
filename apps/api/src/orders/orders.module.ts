import { Module } from "@nestjs/common";
import { OrdersController, PaymentAccountsController } from "./orders.controller";
import { OrdersService } from "./orders.service";
import { OrderRepository } from "./repositories/order.repository";
import { CreateOrderUseCase } from "./use-cases/create-order.use-case";
import { ObservabilityModule } from "../observability/observability.module";

@Module({
  imports: [ObservabilityModule],
  controllers: [OrdersController, PaymentAccountsController],
  providers: [OrdersService, OrderRepository, CreateOrderUseCase],
  exports: [OrdersService]
})
export class OrdersModule {}
