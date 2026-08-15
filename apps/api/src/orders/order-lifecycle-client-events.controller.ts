import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { MetricsService } from "../observability/metrics.service";
import { StructuredLoggerService } from "../observability/structured-logger.service";
import { OrderLifecycleClientEventDto } from "./dto/order-lifecycle-client-event.dto";

@UseGuards(JwtAuthGuard)
@Controller("orders/lifecycle")
export class OrderLifecycleClientEventsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService
  ) {}

  @Post("client-events")
  record(@Body() dto: OrderLifecycleClientEventDto) {
    const source = dto.source ?? "WEB";
    const labels = {
      event: dto.event,
      source,
      surface: dto.surface,
      ...(dto.commandType ? { commandType: dto.commandType } : {})
    };
    this.metrics.increment("order_lifecycle_client_events_total", labels);
    this.logger.info("order_lifecycle_client_event", {
      clientEvent: dto.event,
      source,
      surface: dto.surface,
      ...(dto.commandType ? { commandType: dto.commandType } : {})
    });
    return { accepted: true } as const;
  }
}
