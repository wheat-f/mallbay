import { Module } from "@nestjs/common";
import { AuditLogService } from "./audit-log.service";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";

@Module({
  providers: [AuditLogService, MetricsService, StructuredLoggerService],
  exports: [AuditLogService, MetricsService, StructuredLoggerService]
})
export class ObservabilityModule {}
