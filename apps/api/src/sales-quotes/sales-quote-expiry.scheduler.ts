import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { CapacityReservationService } from "../construction/capacity-reservation.service";
import { SalesQuotesService } from "./sales-quotes.service";

/**
 * Releases quote/capacity holds without requiring an external cron service.
 * The timer is unref'ed so it never prevents tests or graceful shutdown.
 * A deployment can still call runOnce from a worker/cron if preferred.
 */
@Injectable()
export class SalesQuoteExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly quotes: SalesQuotesService,
    private readonly capacity: CapacityReservationService
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.runOnce(), 60_000);
    this.timer.unref?.();
    void this.runOnce();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async runOnce(now = new Date()) {
    const quotes = await this.quotes.expirePending(now);
    const reservations = await this.capacity.releaseExpired(now);
    const correctedCapacities = await this.capacity.reconcileToday(now);
    return { quotes, reservations, correctedCapacities };
  }
}
