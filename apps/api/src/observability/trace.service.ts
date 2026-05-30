import { Injectable } from "@nestjs/common";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";

@Injectable()
export class TraceService {
  constructor(
    private readonly logger: StructuredLoggerService,
    private readonly metrics: MetricsService
  ) {}

  async traceOperation<T>(
    operation: string,
    fields: Record<string, unknown>,
    callback: () => Promise<T>
  ) {
    const startedAt = Date.now();
    const component = typeof fields.component === "string" ? fields.component : "app";
    const labels = { component, operation };

    try {
      const result = await callback();
      const latencyMs = Date.now() - startedAt;
      this.metrics.increment("trace_operations_total", { ...labels, status: "success" });
      this.metrics.recordLatency("trace_operation_duration_ms", latencyMs, labels);
      this.logger.debug(`trace.${operation}`, {
        ...fields,
        status: "success",
        latencyMs
      });
      return result;
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      this.metrics.increment("trace_operations_total", { ...labels, status: "error" });
      this.metrics.recordLatency("trace_operation_duration_ms", latencyMs, labels);
      this.logger.error(`trace.${operation}`, {
        ...fields,
        status: "error",
        latencyMs,
        errorName: error instanceof Error ? error.name : "UnknownError"
      });
      throw error;
    }
  }
}
