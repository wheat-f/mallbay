import { Inject, Injectable, OnModuleDestroy, OnModuleInit, Optional } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { MetricsService } from "../observability/metrics.service";
import { StructuredLoggerService } from "../observability/structured-logger.service";

type PrismaQueryEvent = {
  query: string;
  params: string;
  duration: number;
  target: string;
};

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(
    config: ConfigService,
    @Optional() @Inject(StructuredLoggerService) logger?: StructuredLoggerService,
    @Optional() @Inject(MetricsService) metrics?: MetricsService
  ) {
    const connectionString =
      config.get<string>("DATABASE_URL") ?? "postgresql://postgres:postgres@localhost:5432/mallbay?schema=public";

    super({
      adapter: new PrismaPg({
        connectionString
      }),
      log: logger && metrics ? [{ emit: "event", level: "query" }] : undefined
    });

    if (logger && metrics) {
      const prisma = this as unknown as {
        $on(event: "query", callback: (event: PrismaQueryEvent) => void): void;
      };
      prisma.$on("query", (event) => recordPrismaQueryTrace(event, logger, metrics));
    }
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

export function recordPrismaQueryTrace(
  event: PrismaQueryEvent,
  logger: Pick<StructuredLoggerService, "debug">,
  metrics: Pick<MetricsService, "increment" | "recordLatency">
) {
  const labels = {
    component: "prisma",
    operation: "prisma.query"
  };

  metrics.increment("trace_operations_total", { ...labels, status: "success" });
  metrics.recordLatency("trace_operation_duration_ms", event.duration, labels);
  logger.debug("trace.prisma.query", {
    component: "prisma",
    target: event.target,
    durationMs: event.duration,
    query: event.query
  });
}
