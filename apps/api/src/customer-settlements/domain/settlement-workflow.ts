import { Injectable } from "@nestjs/common";
import { SettlementExecutionImplementation, type AuthenticatedSettlementUser } from "../settlement-execution-implementation";
import type {
  CreateCustomerReceiptDto,
  CreateCustomerStatementDto,
  ReverseCustomerReceiptDto,
  StatementActionDto
} from "../dto/customer-settlement.dto";

/** Writes settlement documents and delegates cash facts to Finance. */
@Injectable()
export class SettlementWorkflow {
  constructor(private readonly implementation: SettlementExecutionImplementation) {}

  createStatement(user: AuthenticatedSettlementUser, input: CreateCustomerStatementDto) { return this.implementation.createStatement(user, input); }
  confirmStatement(user: AuthenticatedSettlementUser, id: string) { return this.implementation.confirmStatement(user, id); }
  voidStatement(user: AuthenticatedSettlementUser, id: string, input: StatementActionDto) { return this.implementation.voidStatement(user, id, input); }
  createReceipt(user: AuthenticatedSettlementUser, input: CreateCustomerReceiptDto) { return this.implementation.createReceipt(user, input); }
  reverseReceipt(user: AuthenticatedSettlementUser, id: string, input: ReverseCustomerReceiptDto) { return this.implementation.reverseReceipt(user, id, input); }
}
