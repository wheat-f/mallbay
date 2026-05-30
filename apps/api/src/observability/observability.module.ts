import { Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";
import { TraceService } from "./trace.service";

@Module({
  providers: [AuditLogService, MetricsService, StructuredLoggerService, TraceService],
  exports: [AuditLogService, MetricsService, StructuredLoggerService, TraceService]
})
export class ObservabilityModule {}
