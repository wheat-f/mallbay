import type { PricingAuthenticatedUser } from "../../pricing/pricing.service";
import type {
  CreateSalesQuoteDto,
  ExportSalesQuoteDetailsDto,
  ListSalesQuotesDto,
  RecalculateSalesQuoteDto,
  ReviewSalesQuoteDto,
  SubmitSalesQuoteDto,
  WithdrawSalesQuoteDto
} from "../dto/sales-quote.dto";

export const QUOTE_WORKFLOW = Symbol("QUOTE_WORKFLOW");
export const QUOTE_READ_MODEL = Symbol("QUOTE_READ_MODEL");

/**
 * Deep command seam for the quote execution process. Callers know command
 * invariants and result/error semantics, but not Prisma or adapter details.
 */
export interface QuoteWorkflow {
  create(user: PricingAuthenticatedUser, idempotencyKey: string | undefined, dto: CreateSalesQuoteDto): Promise<unknown>;
  submit(user: PricingAuthenticatedUser, id: string, dto: SubmitSalesQuoteDto): Promise<unknown>;
  review(user: PricingAuthenticatedUser, id: string, approve: boolean, dto: ReviewSalesQuoteDto): Promise<unknown>;
  withdraw(user: PricingAuthenticatedUser, id: string, dto: WithdrawSalesQuoteDto): Promise<unknown>;
  recalculate(user: PricingAuthenticatedUser, id: string, dto: RecalculateSalesQuoteDto, commandId?: string): Promise<unknown>;
  expirePending(now?: Date): Promise<QuoteExpiryResult>;
  convertToOrder(user: PricingAuthenticatedUser, id: string, commandId: string | undefined): Promise<unknown>;
}

/** Read-only seam; reads never trigger quote, capacity, audit, or order writes. */
export interface QuoteReadModel {
  list(user: PricingAuthenticatedUser, dto: ListSalesQuotesDto): Promise<unknown>;
  exportDetails(user: PricingAuthenticatedUser, dto: ExportSalesQuoteDetailsDto): Promise<unknown>;
  get(user: PricingAuthenticatedUser, id: string, storeId: string): Promise<unknown>;
}

export type QuoteExpiryResult = {
  scannedCount: number;
  expiredCount: number;
  capacityReleasePendingCount: number;
};
