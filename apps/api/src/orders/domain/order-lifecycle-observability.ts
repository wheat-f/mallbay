import { Injectable, Optional } from "@nestjs/common";
import { MetricsService } from "../../observability/metrics.service";
import { StructuredLoggerService } from "../../observability/structured-logger.service";

export type OrderLifecycleObservation = {
  commandType: string;
  source: string;
  replayed: boolean;
  beforeVersion: number | null;
  afterVersion: number | null;
  resultCode: string;
  durationMs: number;
  crossStore: boolean;
  rolledBack: boolean;
  notificationIntentCount: number | null;
};

/**
 * Keeps command-level observability beside the single lifecycle seam. The
 * logger is deliberately post-transaction: a failed transaction can be
 * reported as rolled back without ever claiming a committed business fact.
 */
@Injectable()
export class OrderLifecycleObservability {
  constructor(
    @Optional() private readonly metrics?: MetricsService,
    @Optional() private readonly logger?: StructuredLoggerService
  ) {}

  record(event: OrderLifecycleObservation) {
    const labels = {
      commandType: event.commandType,
      source: event.source,
      outcome: event.resultCode,
      crossStore: String(event.crossStore),
      rolledBack: String(event.rolledBack)
    };
    this.metrics?.increment("order_lifecycle_commands_total", labels);
    this.metrics?.recordLatency("order_lifecycle_command_duration_ms", event.durationMs, {
      commandType: event.commandType,
      source: event.source
    });
    if (event.replayed) this.metrics?.increment("order_lifecycle_replays_total", labels);
    if (event.rolledBack) this.metrics?.increment("order_lifecycle_rollbacks_total", labels);
    this.logger?.info("order_lifecycle.command", event);
  }
}
