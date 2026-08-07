import { Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";
import { TraceService } from "./trace.service";
import { AuditEventWriter } from "./audit-event-writer";

@Module({
  providers: [AuditLogService, AuditEventWriter, MetricsService, StructuredLoggerService, TraceService],
  exports: [AuditLogService, AuditEventWriter, MetricsService, StructuredLoggerService, TraceService]
})
export class ObservabilityModule {}
