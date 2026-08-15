import { Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";
import { TraceService } from "./trace.service";
import { AuditEventWriter } from "./audit-event-writer";
import { OrderLifecycleObservability } from "../orders/domain/order-lifecycle-observability";
import { MetricsController } from "./metrics.controller";

@Module({
  controllers: [MetricsController],
  providers: [AuditLogService, AuditEventWriter, MetricsService, StructuredLoggerService, TraceService, OrderLifecycleObservability],
  exports: [AuditLogService, AuditEventWriter, MetricsService, StructuredLoggerService, TraceService, OrderLifecycleObservability]
})
export class ObservabilityModule {}
