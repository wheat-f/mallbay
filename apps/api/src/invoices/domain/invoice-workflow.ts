import type { ApplyInvoiceDto, InvoiceActionDto, IssueInvoiceDto, SendInvoiceDto } from "../dto/invoice.dto";
import type { AuthenticatedInvoiceUser } from "../invoices.service";

export const INVOICE_WORKFLOW = Symbol("INVOICE_WORKFLOW");

export type InvoiceWorkflow = {
  apply(user: AuthenticatedInvoiceUser, dto: ApplyInvoiceDto): Promise<unknown>;
  issue(user: AuthenticatedInvoiceUser, id: string, dto: IssueInvoiceDto): Promise<unknown>;
  void(user: AuthenticatedInvoiceUser, id: string, dto: InvoiceActionDto): Promise<unknown>;
  reissue(user: AuthenticatedInvoiceUser, id: string, dto: IssueInvoiceDto): Promise<unknown>;
  send(user: AuthenticatedInvoiceUser, id: string, dto: SendInvoiceDto): Promise<unknown>;
};
