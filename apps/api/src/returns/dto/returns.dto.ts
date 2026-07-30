export type ReturnDetailInput = {
  orderItemId?: string;
  purchaseOrderItemId?: string;
  batchId?: string;
  quantity: number;
  unitPriceCents?: number;
  unitCostCents?: number;
  reason: string;
  sourceOutboundBatchId?: string;
};

export class CreateSalesReturnDto {
  storeId!: string;
  executionStoreId?: string;
  orderId!: string;
  reason!: string;
  returnMode?: "PHYSICAL_RETURN" | "REFUND_ONLY";
  details!: ReturnDetailInput[];
  idempotencyKey!: string;
}

export class CreatePurchaseReturnDto {
  storeId!: string;
  executionStoreId?: string;
  purchaseOrderId!: string;
  supplierId?: string;
  supplierName?: string;
  reason!: string;
  returnMode?: "PHYSICAL_RETURN" | "REFUND_ONLY";
  settlementMode?: "SUPPLIER_REFUND" | "PAYABLE_OFFSET" | "EXCHANGE" | "MIXED";
  details!: ReturnDetailInput[];
  idempotencyKey!: string;
}

export class ReturnActionDto {
  idempotencyKey!: string;
  reason?: string;
}

export class ApproveSalesReturnDto extends ReturnActionDto {
  approvedRefundAmountCents?: number;
  approvedQuantity?: number;
  returnMode?: "PHYSICAL_RETURN" | "REFUND_ONLY";
}

export class ApprovePurchaseReturnDto extends ReturnActionDto {
  approvalType!: "BUSINESS" | "FINANCIAL";
  approvedQuantity?: number;
  confirmedAmountCents?: number;
}

export class SettlePurchaseReturnDto extends ReturnActionDto {
  settlementMode!: "SUPPLIER_REFUND" | "PAYABLE_OFFSET" | "EXCHANGE" | "MIXED";
  refundAmountCents?: number;
  payableOffsetAmountCents?: number;
  exchangeQuantity?: number;
  supplierDocumentNo?: string;
  differenceReason?: string;
}

export class ReceiveSalesReturnDto extends ReturnActionDto {
  detailId!: string;
  quantity!: number;
  targetStatus!: "AVAILABLE" | "INSPECTION" | "DAMAGED";
  batchId?: string;
}

export class RefundSalesReturnDto extends ReturnActionDto {
  actualRefundCents!: number;
  refundMethod!: string;
  voucherId!: string;
  waiveRemaining?: boolean;
  waiverReason?: string;
}

export class CancelReturnDto extends ReturnActionDto {}

export class InspectionApproveDto extends ReturnActionDto {
  returnDetailId!: string;
  approvedQuantity!: number;
  targetStatus!: "AVAILABLE" | "DAMAGED";
}

export class InspectionConvertDto extends ReturnActionDto {
  returnDetailId!: string;
  approvedActionId!: string;
  quantity!: number;
  targetStatus!: "AVAILABLE" | "DAMAGED";
}

export class CostVerificationSubmitDto extends ReturnActionDto {
  returnDetailId!: string;
  batchId!: string;
}

export class CostVerificationConfirmDto extends ReturnActionDto {
  returnDetailId!: string;
  batchId!: string;
  verifiedUnitCostCents!: number;
}

export class CostVerificationResubmitDto extends ReturnActionDto {
  returnDetailId!: string;
  batchId!: string;
  supplementNote!: string;
  attachmentIds!: string[];
}