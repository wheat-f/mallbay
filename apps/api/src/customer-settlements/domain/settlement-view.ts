import { Injectable } from "@nestjs/common";
import { CustomerSettlementsService } from "../customer-settlements.service";

type SettlementUser = Parameters<CustomerSettlementsService["listStatements"]>[0];
type SettlementQuery = Parameters<CustomerSettlementsService["listStatements"]>[1];

/** Read-only enterprise settlement projection seam. */
@Injectable()
export class SettlementView {
  constructor(private readonly implementation: CustomerSettlementsService) {}

  getSettlementView(user: SettlementUser, query: SettlementQuery) {
    return this.implementation.listStatements(user, query);
  }
}
