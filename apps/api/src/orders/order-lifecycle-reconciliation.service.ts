import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { MetricsService } from "../observability/metrics.service";
import { StructuredLoggerService } from "../observability/structured-logger.service";
import { PrismaService } from "../prisma/prisma.service";
import { checkHistoricalLifecycleGate, type HistoricalLifecycleViolation } from "../prisma/historical-lifecycle-gate";

const RECONCILIATION_INTERVAL_MS = 5 * 60_000;
const RECONCILIATION_ACTOR = "system:order-lifecycle-reconciler";

type VerificationCandidate = {
  orderId: string;
  issueCodes: string[];
};

/**
 * Converts runtime invariant findings into durable, idempotent verification cases.
 * The advisory lock is transaction-scoped so multiple API instances cannot create
 * two OPEN cases for the same order without introducing a second business seam.
 */
@Injectable()
export class OrderLifecycleReconciliationService implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
    private readonly logger: StructuredLoggerService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), RECONCILIATION_INTERVAL_MS);
    this.timer.unref?.();
    void this.runOnce().catch(() => undefined);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce() {
    if (this.running) return { skipped: true, violations: 0, casesCreated: 0, casesUpdated: 0 } as const;
    this.running = true;
    try {
      const violations = await checkHistoricalLifecycleGate(this.prisma);
      for (const violation of violations) {
        this.metrics.increment(
          "order_lifecycle_reconciliation_violations_total",
          { invariant: violation.invariant },
          violation.rows.length
        );
      }
      const candidates = collectCandidates(violations);
      let casesCreated = 0;
      let casesUpdated = 0;
      for (const candidate of candidates.values()) {
        const result = await this.upsertVerificationCase(candidate);
        if (result === "created") casesCreated += 1;
        if (result === "updated") casesUpdated += 1;
      }
      if (violations.length > 0) {
        this.logger.warn("order_lifecycle_reconciliation_findings", {
          violationCount: violations.length,
          candidateCount: candidates.size,
          casesCreated,
          casesUpdated
        });
      }
      return { skipped: false, violations: violations.length, casesCreated, casesUpdated } as const;
    } catch (error) {
      this.metrics.increment("order_lifecycle_reconciliation_failures_total");
      this.logger.error("order_lifecycle_reconciliation_failed", { error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async upsertVerificationCase(candidate: VerificationCandidate) {
    return this.prisma.$transaction(async (tx) => {
      // hashtext is deterministic within PostgreSQL and the lock is released at commit.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${candidate.orderId}))`;
      const existing = await tx.orderLifecycleVerificationCase.findFirst({
        where: { orderId: candidate.orderId, status: "OPEN" },
        select: { id: true, issueCodes: true }
      });
      if (!existing) {
        await tx.orderLifecycleVerificationCase.create({
          data: {
            orderId: candidate.orderId,
            issueCodes: candidate.issueCodes,
            status: "OPEN",
            detectedBy: RECONCILIATION_ACTOR
          }
        });
        this.metrics.increment("order_lifecycle_reconciliation_cases_created_total");
        return "created" as const;
      }

      const existingCodes = Array.isArray(existing.issueCodes)
        ? existing.issueCodes.filter((value): value is string => typeof value === "string")
        : [];
      const issueCodes = [...new Set([...existingCodes, ...candidate.issueCodes])];
      if (issueCodes.every((code) => existingCodes.includes(code))) return "existing" as const;
      await tx.orderLifecycleVerificationCase.update({
        where: { id: existing.id },
        data: { issueCodes: issueCodes as Prisma.InputJsonValue }
      });
      this.metrics.increment("order_lifecycle_reconciliation_cases_updated_total");
      return "updated" as const;
    });
  }
}

function collectCandidates(violations: HistoricalLifecycleViolation[]) {
  const candidates = new Map<string, VerificationCandidate>();
  for (const violation of violations) {
    const issueCode = issueCodeFor(violation.invariant);
    if (!issueCode) continue;
    for (const row of violation.rows) {
      const orderId = getOrderId(row);
      if (!orderId) continue;
      const candidate = candidates.get(orderId) ?? { orderId, issueCodes: [] };
      if (!candidate.issueCodes.includes(issueCode)) candidate.issueCodes.push(issueCode);
      candidates.set(orderId, candidate);
    }
  }
  return candidates;
}

function issueCodeFor(invariant: string) {
  switch (invariant) {
    case "terminal_order_quality_missing":
      return "QUALITY_RESULT_MISSING";
    case "terminal_order_warranty_missing":
      return "WARRANTY_FACT_MISSING";
    case "historical_violation_without_case":
      return "HISTORICAL_FACTS_INCONSISTENT";
    case "applied_command_without_version_change":
      return "LIFECYCLE_VERSION_LEDGER_MISSING";
    case "orphan_command_version_change":
      return "LIFECYCLE_VERSION_LEDGER_ORPHAN";
    default:
      return undefined;
  }
}

function getOrderId(row: unknown) {
  if (!row || typeof row !== "object") return undefined;
  const value = (row as Record<string, unknown>).orderId;
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
