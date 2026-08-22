import { ConflictException, Injectable } from "@nestjs/common";

export type CashFactType =
  | "ORDER_PAYMENT"
  | "CUSTOMER_RECEIPT"
  | "CUSTOMER_RECEIPT_REVERSAL"
  | "REBATE"
  | "REIMBURSEMENT"
  | "SUPPLIER_REFUND_OUT"
  | "SUPPLIER_REFUND_REVERSAL";

export type CashFactDirection = "INCOME" | "EXPENSE" | "INFLOW" | "OUTFLOW";

export type CashFactInput = {
  storeId: string;
  accountId?: string;
  type: CashFactType;
  direction: CashFactDirection;
  amountCents: number;
  sourceType?: string;
  sourceId?: string;
  note?: string;
  createdById: string;
  occurredAt: Date;
  idempotencyKey: string;
  reversalOfId?: string;
};

export type CashFactRecord = CashFactInput & { id: string };

export type CashFactWriteResult = {
  recordId: string;
  created: boolean;
  type: CashFactType;
  sourceId?: string;
  amountCents: number;
};

export type CashFactTransaction = {
  paymentRecord: {
    findFirst: (args: { where: { storeId: string; idempotencyKey: string } }) => Promise<CashFactRecord | null>;
    create: (args: { data: CashFactInput }) => Promise<CashFactRecord>;
  };
};

/** Adapts an already-open persistence transaction to the narrow cash-fact seam. */
export function toCashFactTransaction(transaction: unknown): CashFactTransaction {
  return transaction as CashFactTransaction;
}

@Injectable()
export class CashFactWriter {
  async write(transaction: CashFactTransaction, input: CashFactInput): Promise<CashFactWriteResult> {
    const existing = await transaction.paymentRecord.findFirst({
      where: { storeId: input.storeId, idempotencyKey: input.idempotencyKey }
    });
    if (existing) {
      assertReplay(existing, input);
      return toResult(existing, false);
    }

    try {
      const record = await transaction.paymentRecord.create({ data: input });
      return toResult(record, true);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException({
          code: "CASH_FACT_CONCURRENT_WRITE",
          message: "相同现金事实正在被其他事务写入，请使用相同幂等键重试"
        });
      }
      throw error;
    }
  }

  recordOrderPayment(transaction: CashFactTransaction, input: Omit<CashFactInput, "type" | "direction">) {
    return this.write(transaction, { ...input, type: "ORDER_PAYMENT", direction: "INCOME" });
  }

  recordCustomerReceipt(transaction: CashFactTransaction, input: Omit<CashFactInput, "type" | "direction">) {
    return this.write(transaction, { ...input, type: "CUSTOMER_RECEIPT", direction: "INCOME" });
  }

  recordCustomerReceiptReversal(transaction: CashFactTransaction, input: Omit<CashFactInput, "type" | "direction">) {
    return this.write(transaction, { ...input, type: "CUSTOMER_RECEIPT_REVERSAL", direction: "EXPENSE" });
  }

  recordRebatePayout(transaction: CashFactTransaction, input: Omit<CashFactInput, "type" | "direction">) {
    return this.write(transaction, { ...input, type: "REBATE", direction: "EXPENSE" });
  }

  recordReimbursementPayout(transaction: CashFactTransaction, input: Omit<CashFactInput, "type" | "direction">) {
    return this.write(transaction, { ...input, type: "REIMBURSEMENT", direction: "EXPENSE" });
  }

  recordSupplierRefundPayout(transaction: CashFactTransaction, input: Omit<CashFactInput, "type" | "direction">) {
    return this.write(transaction, { ...input, type: "SUPPLIER_REFUND_OUT", direction: "OUTFLOW" });
  }

  recordSupplierRefundReversal(
    transaction: CashFactTransaction,
    input: Omit<CashFactInput, "type" | "direction" | "reversalOfId"> & { reversalOfId: string }
  ) {
    return this.write(transaction, { ...input, type: "SUPPLIER_REFUND_REVERSAL", direction: "INFLOW" });
  }
}

function assertReplay(existing: CashFactRecord, input: CashFactInput) {
  const matches = [
    existing.type === input.type,
    existing.direction === input.direction,
    existing.amountCents === input.amountCents,
    existing.accountId === input.accountId,
    existing.sourceType === input.sourceType,
    existing.sourceId === input.sourceId,
    existing.createdById === input.createdById,
    existing.occurredAt.getTime() === input.occurredAt.getTime(),
    existing.reversalOfId === input.reversalOfId
  ].every(Boolean);
  if (!matches) {
    throw new ConflictException({
      code: "CASH_FACT_IDEMPOTENCY_CONFLICT",
      message: "相同现金事实幂等键已绑定不同输入"
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function toResult(record: CashFactRecord, created: boolean): CashFactWriteResult {
  return {
    recordId: record.id,
    created,
    type: record.type,
    sourceId: record.sourceId,
    amountCents: record.amountCents
  };
}
