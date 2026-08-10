import { Injectable } from "@nestjs/common";
import { CustomerSettlementsService, type AuthenticatedSettlementUser } from "../customer-settlements.service";
import type {
  CreateCustomerReceiptDto,
  CreateCustomerStatementDto,
  PreviewCustomerReceiptDto,
  ReverseCustomerReceiptDto,
  StatementActionDto
} from "../dto/customer-settlement.dto";

/** Writes settlement documents and delegates cash facts to Finance. */
@Injectable()
export class SettlementWorkflow {
  constructor(private readonly implementation: CustomerSettlementsService) {}

  createStatement(user: AuthenticatedSettlementUser, input: CreateCustomerStatementDto) { return this.implementation.createStatement(user, input); }
  confirmStatement(user: AuthenticatedSettlementUser, id: string) { return this.implementation.confirmStatement(user, id); }
  voidStatement(user: AuthenticatedSettlementUser, id: string, input: StatementActionDto) { return this.implementation.voidStatement(user, id, input); }
  previewReceipt(user: AuthenticatedSettlementUser, input: PreviewCustomerReceiptDto) { return this.implementation.previewReceiptAllocation(user, input); }
  createReceipt(user: AuthenticatedSettlementUser, input: CreateCustomerReceiptDto) { return this.implementation.createReceipt(user, input); }
  reverseReceipt(user: AuthenticatedSettlementUser, id: string, input: ReverseCustomerReceiptDto) { return this.implementation.reverseReceipt(user, id, input); }
}
