import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "@prisma/client";
import { AccessContext } from "../permissions/domain/access-context";
import { CashFactWriter, toCashFactTransaction } from "../finance/domain/cash-fact-writer";
import { InventoryLedger, toInventoryLedgerTransaction } from "../inventory/domain/inventory-ledger";
import { ApprovePurchaseReturnDto, ApproveSalesReturnDto, CancelReturnDto, CostVerificationConfirmDto, CostVerificationResubmitDto, CostVerificationSubmitDto, CreatePurchaseReturnDto, CreateSalesReturnDto, InspectionApproveDto, InspectionConvertDto, ReceiveSalesReturnDto, RefundSalesReturnDto, ReturnActionDto, SettlePurchaseReturnDto } from "./dto/returns.dto";

export type ReturnUser = { id: string; username?: string };

export type ReturnsWorkflowCommand =
  | { action: "CREATE_SALES"; user: ReturnUser; dto: CreateSalesReturnDto }
  | { action: "SUBMIT_SALES"; user: ReturnUser; id: string; dto: ReturnActionDto }
  | { action: "APPROVE_SALES"; user: ReturnUser; id: string; dto: ApproveSalesReturnDto }
  | { action: "RECEIVE_SALES"; user: ReturnUser; id: string; dto: ReceiveSalesReturnDto }
  | { action: "APPROVE_INSPECTION"; user: ReturnUser; id: string; dto: InspectionApproveDto }
  | { action: "CONVERT_INSPECTION"; user: ReturnUser; id: string; dto: InspectionConvertDto }
  | { action: "SUBMIT_COST_VERIFICATION"; user: ReturnUser; id: string; dto: CostVerificationSubmitDto }
  | { action: "CONFIRM_COST_VERIFICATION"; user: ReturnUser; id: string; dto: CostVerificationConfirmDto }
  | { action: "RESUBMIT_COST_VERIFICATION"; user: ReturnUser; id: string; dto: CostVerificationResubmitDto }
  | { action: "REFUND_SALES"; user: ReturnUser; id: string; dto: RefundSalesReturnDto }
  | { action: "CANCEL_SALES"; user: ReturnUser; id: string; dto: CancelReturnDto }
  | { action: "CREATE_PURCHASE"; user: ReturnUser; dto: CreatePurchaseReturnDto }
  | { action: "SUBMIT_PURCHASE"; user: ReturnUser; id: string; dto: ReturnActionDto }
  | { action: "APPROVE_PURCHASE"; user: ReturnUser; id: string; dto: ApprovePurchaseReturnDto }
  | { action: "OUTBOUND_PURCHASE"; user: ReturnUser; id: string; detailId: string; quantity: number; dto: ReturnActionDto }
  | { action: "SETTLE_PURCHASE"; user: ReturnUser; id: string; dto: SettlePurchaseReturnDto }
  | { action: "REVERSE_SETTLEMENT"; user: ReturnUser; id: string; adjustmentId: string; dto: ReturnActionDto }
  | { action: "CANCEL_PURCHASE"; user: ReturnUser; id: string; dto: CancelReturnDto };

@Injectable()
export class ReturnsWorkflow {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    private readonly cashFactWriter: CashFactWriter,
    private readonly inventoryLedger: InventoryLedger
  ) {}

  private runTransaction<T>(callback: (tx: Prisma.TransactionClient) => Promise<T>) {
    return this.prisma.$transaction(callback, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async execute(command: ReturnsWorkflowCommand) {
    switch (command.action) {
      case "CREATE_SALES": return this.createSales(command.user, command.dto);
      case "SUBMIT_SALES": return this.submitSales(command.user, command.id, command.dto);
      case "APPROVE_SALES": return this.approveSales(command.user, command.id, command.dto);
      case "RECEIVE_SALES": return this.receiveSales(command.user, command.id, command.dto);
      case "APPROVE_INSPECTION": return this.approveInspection(command.user, command.id, command.dto);
      case "CONVERT_INSPECTION": return this.convertInspection(command.user, command.id, command.dto);
      case "SUBMIT_COST_VERIFICATION": return this.submitCostVerification(command.user, command.id, command.dto);
      case "CONFIRM_COST_VERIFICATION": return this.confirmCostVerification(command.user, command.id, command.dto);
      case "RESUBMIT_COST_VERIFICATION": return this.resubmitCostVerification(command.user, command.id, command.dto);
      case "REFUND_SALES": return this.refundSales(command.user, command.id, command.dto);
      case "CANCEL_SALES": return this.cancelSales(command.user, command.id, command.dto);
      case "CREATE_PURCHASE": return this.createPurchase(command.user, command.dto);
      case "SUBMIT_PURCHASE": return this.submitPurchase(command.user, command.id, command.dto);
      case "APPROVE_PURCHASE": return this.approvePurchase(command.user, command.id, command.dto);
      case "OUTBOUND_PURCHASE": return this.outboundPurchase(command.user, command.id, command.detailId, command.quantity, command.dto);
      case "SETTLE_PURCHASE": return this.settlePurchase(command.user, command.id, command.dto);
      case "REVERSE_SETTLEMENT": return this.reverseSettlement(command.user, command.id, command.adjustmentId, command.dto);
      case "CANCEL_PURCHASE": return this.cancelPurchase(command.user, command.id, command.dto);
    }
  }

  private requireAction(user: ReturnUser, action: "create" | "approve" | "manage") {
    return this.accessContext.require({ userId: user.id }, "returns", action);
  }
  private requireStore(user: ReturnUser, storeId: string, kind: "SALES" | "PURCHASE", finance = false) {
    const action = finance ? "finance" : "write";
    return this.accessContext.require({ userId: user.id }, "returns", action, { storeId }).catch((error: unknown) => {
      if (!(error instanceof ForbiddenException)) throw error;
      const response = error.getResponse();
      const code = typeof response === "object" && response && "code" in response
        ? String((response as { code?: unknown }).code ?? "ACCESS_DENIED")
        : "ACCESS_DENIED";
      throw new ForbiddenException({ code, message: `无权访问该门店${kind === "SALES" ? "销售" : "采购"}退货` });
    });
  }

  private async existingAction(returnType: "SALES" | "PURCHASE", returnId: string, actionType: string, idempotencyKey: string) {
    if (!idempotencyKey?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: idempotencyKey 必填");
    return this.prisma.returnAction.findFirst({ where: { returnType, returnId, actionType, idempotencyKey } });
  }
  private async beginAction(returnType: "SALES" | "PURCHASE", returnId: string, actionType: string, idempotencyKey: string, actorId: string, requestSummary?: Prisma.InputJsonValue) {
    const existing = await this.existingAction(returnType, returnId, actionType, idempotencyKey)
    if (existing) {
      if (requestSummary && JSON.stringify(existing.requestSummary ?? {}) !== JSON.stringify(requestSummary)) throw new ConflictException("RETURN_IDEMPOTENCY_CONFLICT")
      if (existing.status === "SUCCEEDED") return { action: existing, replay: true }
      throw new ConflictException(existing.status === "FAILED" ? "RETURN_IDEMPOTENCY_FAILED: 请使用新的幂等键重试" : "RETURN_IDEMPOTENCY_IN_PROGRESS")
    }
    try {
      const action = await this.prisma.returnAction.create({ data: { returnType, returnId, actionType, status: "PENDING", actorId, idempotencyKey, requestSummary } })
      return { action, replay: false }
    } catch (error) {
      const raced = await this.existingAction(returnType, returnId, actionType, idempotencyKey)
      if (raced) throw new ConflictException("RETURN_IDEMPOTENCY_IN_PROGRESS")
      throw error
    }
  }
  private async failAction(actionId: string, error: unknown): Promise<never> {
    const message = error instanceof Error ? error.message : "RETURN_ACTION_FAILED"
    await this.prisma.returnAction.update({ where: { id: actionId }, data: { status: "FAILED", resultSummary: { error: message } } }).catch(() => undefined)
    throw error
  }
  async createSales(user: ReturnUser, dto: CreateSalesReturnDto) {
    await this.requireStore(user, dto.storeId, "SALES");
    await this.requireAction(user, "create");
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: idempotencyKey 必填");
    if (!dto.details?.length) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 退货明细不能为空");
    const requestSummary = { storeId: dto.storeId, executionStoreId: dto.executionStoreId ?? null, orderId: dto.orderId, returnMode: dto.returnMode ?? "PHYSICAL_RETURN", reason: dto.reason, details: dto.details } as Prisma.InputJsonValue;
    const priorSales = await this.prisma.returnAction.findFirst({ where: { returnType: "SALES", actionType: "CREATE", idempotencyKey: dto.idempotencyKey } });
    if (priorSales) {
      if (JSON.stringify(priorSales.requestSummary ?? {}) !== JSON.stringify(requestSummary)) throw new ConflictException("RETURN_IDEMPOTENCY_CONFLICT");
      return this.prisma.salesReturn.findUnique({ where: { id: priorSales.returnId } });
    }
    const order = await this.prisma.order.findUnique({ where: { id: dto.orderId }, include: { constructionRecord: true } });
    if (!order || order.storeId !== dto.storeId || order.executionStoreId !== (dto.executionStoreId ?? order.executionStoreId)) throw new ForbiddenException("RETURN_STORE_MISMATCH");
    if (!["COMPLETED", "WARRANTIED"].includes(String(order.status))) throw new BadRequestException("RETURN_INVALID_STATUS: 订单状态不允许退货");
    const completedAt = order.constructionRecord?.completedAt ?? order.updatedAt;
    if (Date.now() - completedAt.getTime() > 30 * 24 * 60 * 60 * 1000) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 已超过 30 天退货窗口");
    const details = [] as Array<Record<string, unknown>>;
    let total = 0;
    for (const input of dto.details) {
      if (!input.orderItemId || input.quantity <= 0) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
      const source = await this.prisma.orderItem.findUnique({ where: { id: input.orderItemId } });
      if (!source || source.orderId !== dto.orderId || input.quantity > Number(source.quantity)) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 销售明细不可退");
      const previous = await this.prisma.salesReturnDetail.findMany({ where: { orderItemId: source.id } });
      if (previous.reduce((sum, item) => sum + Number(item.quantity), 0) + input.quantity > Number(source.quantity)) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 超过历史可退数量");
      const unitPriceCents = input.unitPriceCents ?? source.unitPriceCents;
      const amount = Math.round(unitPriceCents * input.quantity);
      total += amount;
      details.push({ orderItemId: source.id, productId: source.productId, quantity: input.quantity, approvedQuantity: input.quantity, refundEligibleQuantity: input.quantity, unitPriceCents, refundAmountCents: amount, reason: input.reason, sourceOutboundBatchId: input.sourceOutboundBatchId });
    }
    const returnNo = "SR-" + Date.now() + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return this.runTransaction(async (tx) => {
      const created = await tx.salesReturn.create({ data: { storeId: dto.storeId, executionStoreId: dto.executionStoreId ?? order.executionStoreId, orderId: dto.orderId, returnNo, reason: dto.reason, returnMode: dto.returnMode ?? "PHYSICAL_RETURN", requestedRefundCents: total, remainingRefundCents: total, createdById: user.id } });
      const action = await tx.returnAction.create({ data: { returnType: "SALES", returnId: created.id, actionType: "CREATE", status: "PENDING", actorId: user.id, idempotencyKey: dto.idempotencyKey, requestSummary } });
      await tx.salesReturnDetail.createMany({ data: details.map((item) => ({ ...item, returnId: created.id })) as never });
      await tx.returnAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", resultSummary: { id: created.id } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: created.storeId, action: "SALES_RETURN_CREATED", targetType: "SalesReturn", targetId: created.id, metadata: { status: created.status, orderId: created.orderId } } });
      return created;
    });
  }  async createPurchase(user: ReturnUser, dto: CreatePurchaseReturnDto) {
    await this.requireStore(user, dto.storeId, "PURCHASE");
    await this.requireAction(user, "create");
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: idempotencyKey 必填");
    if (!dto.details?.length) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 退货明细不能为空");
    const requestSummary = { storeId: dto.storeId, executionStoreId: dto.executionStoreId ?? null, purchaseOrderId: dto.purchaseOrderId, supplierId: dto.supplierId ?? null, supplierName: dto.supplierName ?? null, returnMode: dto.returnMode ?? "PHYSICAL_RETURN", settlementMode: dto.settlementMode ?? "PAYABLE_OFFSET", reason: dto.reason, details: dto.details } as Prisma.InputJsonValue;
    const priorPurchase = await this.prisma.returnAction.findFirst({ where: { returnType: "PURCHASE", actionType: "CREATE", idempotencyKey: dto.idempotencyKey } });
    if (priorPurchase) {
      if (JSON.stringify(priorPurchase.requestSummary ?? {}) !== JSON.stringify(requestSummary)) throw new ConflictException("RETURN_IDEMPOTENCY_CONFLICT");
      return this.prisma.purchaseReturn.findUnique({ where: { id: priorPurchase.returnId } });
    }
    const order = await this.prisma.purchaseOrder.findUnique({ where: { id: dto.purchaseOrderId } });
    if (!order || order.storeId !== dto.storeId) throw new ForbiddenException("RETURN_STORE_MISMATCH");
    if (!["PARTIAL_RECEIVED", "RECEIVED"].includes(String(order.status))) throw new BadRequestException("RETURN_INVALID_STATUS: 采购订单尚未实际入库");
    let supplierId = dto.supplierId;
    const supplierName = dto.supplierName ?? order.supplierName ?? undefined;
    if (!supplierId && supplierName) {
      const matches = await this.prisma.supplier.findMany({ where: { storeId: dto.storeId, name: supplierName, isActive: true } });
      if (matches.length > 1) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 供应商名称匹配不唯一，请人工选择");
      supplierId = matches[0]?.id;
    }
    const details = [] as Array<Record<string, unknown>>;
    let total = 0;
    for (const input of dto.details) {
      if (!input.purchaseOrderItemId || !input.batchId || input.quantity <= 0) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
      const source = await this.prisma.purchaseOrderItem.findUnique({ where: { id: input.purchaseOrderItemId } });
      const batch = await this.prisma.inventoryBatch.findUnique({ where: { id: input.batchId } });
      if (!source || source.purchaseOrderId !== dto.purchaseOrderId || !batch || batch.storeId !== dto.storeId || batch.productId !== source.productId || batch.inventoryStatus !== "AVAILABLE" || batch.availableQuantity.toNumber() < input.quantity) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 采购批次不可退");
      const unitCostCents = input.unitCostCents ?? source.unitCostCents ?? batch.unitCostCents ?? 0;
      const amount = Math.round(unitCostCents * input.quantity);
      total += amount;
      details.push({ purchaseOrderItemId: source.id, productId: source.productId, batchId: batch.id, quantity: input.quantity, approvedQuantity: input.quantity, unitCostCents, refundAmountCents: amount, reason: input.reason });
    }
    const returnNo = "PR-" + Date.now() + "-" + Math.floor(Math.random() * 1000).toString().padStart(3, "0");
    return this.runTransaction(async (tx) => {
      const created = await tx.purchaseReturn.create({ data: { storeId: dto.storeId, executionStoreId: dto.executionStoreId ?? dto.storeId, purchaseOrderId: dto.purchaseOrderId, supplierId, supplierName, returnNo, reason: dto.reason, returnMode: dto.returnMode ?? "PHYSICAL_RETURN", settlementMode: dto.settlementMode ?? "PAYABLE_OFFSET", requestedAmountCents: total, totalAmountCents: total, createdById: user.id } });
      const action = await tx.returnAction.create({ data: { returnType: "PURCHASE", returnId: created.id, actionType: "CREATE", status: "PENDING", actorId: user.id, idempotencyKey: dto.idempotencyKey, requestSummary } });
      await tx.purchaseReturnDetail.createMany({ data: details.map((item) => ({ ...item, returnId: created.id })) as never });
      await tx.returnAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", resultSummary: { id: created.id } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: created.storeId, action: "PURCHASE_RETURN_CREATED", targetType: "PurchaseReturn", targetId: created.id, metadata: { status: created.status, purchaseOrderId: created.purchaseOrderId } } });
      return created;
    });
  }  async listSales(user: ReturnUser, storeId: string) { await this.requireStore(user, storeId, "SALES"); return this.prisma.salesReturn.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }); }
  async listPurchase(user: ReturnUser, storeId: string) { await this.requireStore(user, storeId, "PURCHASE"); return this.prisma.purchaseReturn.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }); }

  async submitSales(user: ReturnUser, id: string, dto: ReturnActionDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    await this.requireStore(user, parent.storeId, "SALES");
    await this.requireAction(user, "create");
    if (parent.status !== "DRAFT") throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("SALES", id, "SALES_SUBMIT", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.salesReturn.update({ where: { id }, data: { status: "SUBMITTED" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: "SUBMITTED", resultSummary: { status: "SUBMITTED" } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_SUBMITTED", targetType: "SalesReturn", targetId: id, metadata: { from: parent.status, to: "SUBMITTED" } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async approveSales(user: ReturnUser, id: string, dto: ApproveSalesReturnDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    await this.requireStore(user, parent.storeId, "SALES");
    await this.requireAction(user, "approve");
    if (parent.status !== "SUBMITTED") throw new BadRequestException("RETURN_INVALID_STATUS");
    const amount = dto.approvedRefundAmountCents ?? parent.requestedRefundCents;
    if (amount < 0 || amount > parent.requestedRefundCents) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    const status = (dto.returnMode ?? parent.returnMode) === "REFUND_ONLY" ? "WAITING_REFUND" : "WAITING_RECEIPT";
    const claim = await this.beginAction("SALES", id, "SALES_APPROVE", dto.idempotencyKey, user.id, { approvedRefundAmountCents: dto.approvedRefundAmountCents, returnMode: dto.returnMode });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.salesReturn.update({ where: { id }, data: { status, approvedRefundCents: amount, remainingRefundCents: amount } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: status, resultSummary: { status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_APPROVED", targetType: "SalesReturn", targetId: id, metadata: { status, approvedRefundCents: amount } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async cancelSales(user: ReturnUser, id: string, dto: CancelReturnDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    await this.requireStore(user, parent.storeId, "SALES");
    await this.requireAction(user, "manage");
    if (!["DRAFT", "SUBMITTED", "PARTIAL_RECEIVED", "PARTIAL_REFUND"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("SALES", id, "SALES_CANCEL", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.salesReturn.update({ where: { id }, data: { status: parent.status.startsWith("PARTIAL") ? "PARTIAL_CANCELLED" : "CANCELLED", waiverReason: dto.reason } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: updated.status, resultSummary: { status: updated.status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_CANCELLED", targetType: "SalesReturn", targetId: id, metadata: { status: updated.status, reason: dto.reason } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async receiveSales(user: ReturnUser, id: string, dto: ReceiveSalesReturnDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.detailId } });
    if (!parent || !detail || detail.returnId !== id) throw new NotFoundException("销售退货明细不存在");
    await this.requireStore(user, parent.executionStoreId, "PURCHASE");
    await this.requireAction(user, "manage");
    if (!["WAITING_RECEIPT", "PARTIAL_RECEIVED"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const remaining = Number(detail.approvedQuantity ?? detail.quantity) - Number(detail.receivedQuantity);
    if (dto.quantity <= 0 || dto.quantity > remaining) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 接收数量超过批准数量");
    const targetStatus = dto.targetStatus ?? "AVAILABLE";
    const claim = await this.beginAction("SALES", id, "SALES_RECEIVE", dto.idempotencyKey, user.id, { detailId: dto.detailId, quantity: dto.quantity, targetStatus });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const sourceBatch = detail.sourceOutboundBatchId ? await tx.inventoryBatch.findUnique({ where: { id: detail.sourceOutboundBatchId } }) : null;
      const unitCostCents = sourceBatch?.unitCostCents ?? 0;
      const batch = await this.inventoryLedger.receiveSalesReturnWithin(toInventoryLedgerTransaction(tx), {
        storeId: parent.executionStoreId,
        productId: detail.productId,
        batchNo: `RET-${Date.now()}-${detail.id.slice(-6)}`,
        unit: detail.salesUnit ?? sourceBatch?.unit ?? "ROLL",
        baseUnit: sourceBatch?.baseUnit ?? "PIECE",
        quantity: dto.quantity,
        availableQuantity: targetStatus === "AVAILABLE" ? dto.quantity : 0,
        unitCostCents,
        inventoryStatus: targetStatus,
        sourceId: id,
        returnId: id,
        sourceDetailId: detail.id,
        actorId: user.id,
        note: targetStatus === "DAMAGED" ? "销售退货报损" : "销售退货收货"
      });
      const received = Number(detail.receivedQuantity) + dto.quantity;
      await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { receivedQuantity: dto.quantity === 0 ? undefined : { increment: dto.quantity }, status: received >= Number(detail.approvedQuantity ?? detail.quantity) ? "RECEIVED" : "PARTIAL_RECEIVED", inspectionStatus: targetStatus, costStatus: sourceBatch ? "VERIFIED" : "PENDING_VERIFICATION", costAdjustmentCents: sourceBatch && targetStatus !== "DAMAGED" ? unitCostCents * dto.quantity : 0, inventoryBatchId: batch.id } });
      if (sourceBatch && targetStatus !== "DAMAGED") await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, returnDetailId: detail.id, type: "MATERIAL_COST_REVERSAL", amountCents: unitCostCents * dto.quantity, originalValue: { unitCostCents }, newValue: { returnedQuantity: dto.quantity }, calculationBasis: { sourceBatchId: sourceBatch.id }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
      const all = await tx.salesReturnDetail.findMany({ where: { returnId: id } });
      const complete = all.every((item) => Number(item.receivedQuantity) >= Number(item.approvedQuantity ?? item.quantity));
      const status = complete ? "WAITING_REFUND" : "PARTIAL_RECEIVED";
      const updated = await tx.salesReturn.update({ where: { id }, data: { status } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, batchId: batch.id, targetStatus, resultSummary: { batchId: batch.id, quantity: dto.quantity } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.executionStoreId, action: "SALES_RETURN_RECEIVED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { targetStatus, quantity: dto.quantity, batchId: batch.id } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async refundSales(user: ReturnUser, id: string, dto: RefundSalesReturnDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    await this.requireStore(user, parent.storeId, "SALES", true);
    if (!["WAITING_REFUND", "PARTIAL_REFUND"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    if (!dto.voucherId || !dto.refundMethod) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 退款凭证和方式必填");
    const amount = dto.actualRefundCents;
    if (amount < 0 || amount > parent.remainingRefundCents) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 退款金额超过待退款金额");
    const waived = dto.waiveRemaining ? parent.remainingRefundCents - amount : 0;
    if (dto.waiveRemaining && !dto.waiverReason?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 放弃原因必填");
    const left = parent.remainingRefundCents - amount - waived;
    const orderAmount = await this.prisma.orderAmount.findUnique({ where: { orderId: parent.orderId } });
    const commissionAdjustment = parent.approvedRefundCents ? Math.round((orderAmount?.salesCommissionCents ?? 0) * amount / parent.approvedRefundCents) : 0;
    const claim = await this.beginAction("SALES", id, "SALES_REFUND", dto.idempotencyKey, user.id, { amount, refundMethod: dto.refundMethod, voucherId: "[REDACTED]" });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    const refundedAt = new Date();
    return this.runTransaction(async (tx) => {
      const action = claim.action;
      if (amount > 0) await this.cashFactWriter.recordCustomerReceiptReversal(toCashFactTransaction(tx), {
        storeId: parent.executionStoreId,
        amountCents: amount,
        sourceType: "SALES_RETURN",
        sourceId: action.id,
        note: "销售退货线下退款",
        createdById: user.id,
        occurredAt: refundedAt,
        idempotencyKey: `SALES_RETURN_REFUND:${id}:${dto.idempotencyKey}`
      });
      if (amount > 0) {
        await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, type: "REVENUE_REVERSAL", amountCents: amount, originalValue: { approved: parent.approvedRefundCents }, newValue: { refunded: amount }, calculationBasis: { rule: "actual_refund" }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
        await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, type: "RECEIPT_REVERSAL", amountCents: amount, originalValue: { paid: parent.approvedRefundCents }, newValue: { reversed: amount }, calculationBasis: { rule: "actual_refund" }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
        if (commissionAdjustment > 0) await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, type: "COMMISSION_REVERSAL", amountCents: commissionAdjustment, originalValue: { commissionCents: orderAmount?.salesCommissionCents ?? 0 }, newValue: { reversed: commissionAdjustment }, calculationBasis: { refundCents: amount, approvedRefundCents: parent.approvedRefundCents }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
      }
      const updated = await tx.salesReturn.update({ where: { id }, data: { status: left === 0 ? "REFUNDED" : "PARTIAL_REFUND", actualRefundCents: amount, refundedAmountCents: { increment: amount }, waivedRefundCents: { increment: waived }, remainingRefundCents: left, waiverReason: dto.waiverReason, refundMethod: dto.refundMethod, voucherId: dto.voucherId, refundedById: user.id, refundedAt } });
      await tx.returnAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", resultSummary: { refundedAmountCents: amount, remainingRefundCents: left } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.executionStoreId, action: "SALES_RETURN_REFUNDED", targetType: "SalesReturn", targetId: id, metadata: { amountCents: amount, waivedRefundCents: waived, remainingRefundCents: left, refundMethod: dto.refundMethod } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async approveInspection(user: ReturnUser, id: string, dto: InspectionApproveDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    if (!parent || !detail || detail.returnId !== id || detail.inspectionStatus !== "INSPECTION") throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    await this.requireStore(user, parent.executionStoreId, "PURCHASE");
    await this.requireAction(user, "manage");
    if (dto.approvedQuantity <= 0 || dto.approvedQuantity > Number(detail.receivedQuantity)) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    const claim = await this.beginAction("SALES", id, "INSPECTION_APPROVE", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, targetStatus: dto.targetStatus, approvedQuantity: dto.approvedQuantity });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { inspectionApprovalStatus: "APPROVED", inspectionApprovedQuantity: dto.approvedQuantity, inspectionApprovedById: user.id, inspectionApprovedAt: new Date() } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.executionStoreId, action: "SALES_RETURN_INSPECTION_APPROVED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { approvedQuantity: dto.approvedQuantity, targetStatus: dto.targetStatus } } });
      return tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, targetStatus: dto.targetStatus, approvedQuantity: dto.approvedQuantity, resultSummary: { status: "APPROVED" } } });
    }).catch((error) => this.failAction(actionId, error));
  }

  async convertInspection(user: ReturnUser, id: string, dto: InspectionConvertDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    const approval = await this.prisma.returnAction.findUnique({ where: { id: dto.approvedActionId } });
    if (!parent || !detail || detail.returnId !== id || !detail.inventoryBatchId || !approval || approval.actionType !== "INSPECTION_APPROVE") throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    await this.requireStore(user, parent.executionStoreId, "PURCHASE");
    await this.requireAction(user, "manage");
    if (dto.quantity <= 0 || dto.quantity > Number(detail.inspectionApprovedQuantity ?? 0)) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    const claim = await this.beginAction("SALES", id, "INSPECTION_CONVERT", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, quantity: dto.quantity, targetStatus: dto.targetStatus });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const source = await tx.inventoryBatch.findUnique({ where: { id: detail.inventoryBatchId! } });
      if (!source) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
      const child = await this.inventoryLedger.convertSalesReturnInspectionWithin(toInventoryLedgerTransaction(tx), {
        sourceBatchId: source.id,
        quantity: dto.quantity,
        targetStatus: dto.targetStatus,
        sourceId: id,
        returnId: id,
        sourceDetailId: detail.id,
        actorId: user.id
      });
      await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { inspectionApprovalStatus: "EXECUTED" } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: source.storeId, action: "SALES_RETURN_INSPECTION_CONVERTED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { quantity: dto.quantity, targetStatus: dto.targetStatus, sourceBatchId: source.id, childBatchId: child.id } } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, batchId: child.id, resultSummary: { batchId: child.id, quantity: dto.quantity } } });
      return child;
    }).catch((error) => this.failAction(actionId, error));
  }

  async submitCostVerification(user: ReturnUser, id: string, dto: CostVerificationSubmitDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    if (!parent || !detail || detail.returnId !== id || !["PENDING_VERIFICATION", "REJECTED"].includes(String(detail.costStatus))) throw new BadRequestException("RETURN_INVALID_STATUS");
    await this.requireStore(user, parent.storeId, "PURCHASE");
    await this.requireAction(user, "manage");
    const claim = await this.beginAction("SALES", id, "COST_VERIFICATION_SUBMIT", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, batchId: dto.batchId, reason: dto.reason });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { costStatus: "PENDING_VERIFICATION" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, resultSummary: { status: "PENDING_VERIFICATION" } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_COST_SUBMITTED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { batchId: dto.batchId, status: "PENDING_VERIFICATION" } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }

  async confirmCostVerification(user: ReturnUser, id: string, dto: CostVerificationConfirmDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    if (!parent || !detail || detail.returnId !== id || dto.verifiedUnitCostCents < 0) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    await this.requireStore(user, parent.storeId, "SALES", true);
    const claim = await this.beginAction("SALES", id, "COST_VERIFICATION_CONFIRM", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, batchId: dto.batchId, verifiedUnitCostCents: dto.verifiedUnitCostCents });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const amount = dto.verifiedUnitCostCents * Number(detail.refundEligibleQuantity);
      const updated = await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { costStatus: "VERIFIED", verifiedUnitCostCents: dto.verifiedUnitCostCents, costAdjustmentCents: amount } });
      await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, returnDetailId: detail.id, type: "COST_DIFFERENCE", amountCents: amount, originalValue: { status: detail.costStatus }, newValue: { verifiedUnitCostCents: dto.verifiedUnitCostCents }, calculationBasis: { quantity: detail.refundEligibleQuantity }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, resultSummary: { status: "VERIFIED", amountCents: amount } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_COST_CONFIRMED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { batchId: dto.batchId, amountCents: amount, verifiedUnitCostCents: dto.verifiedUnitCostCents } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }

  async resubmitCostVerification(user: ReturnUser, id: string, dto: CostVerificationResubmitDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    if (!parent || !detail || detail.returnId !== id || detail.costStatus !== "REJECTED" || !dto.supplementNote.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    await this.requireStore(user, parent.storeId, "PURCHASE");
    await this.requireAction(user, "manage");
    const claim = await this.beginAction("SALES", id, "COST_VERIFICATION_RESUBMIT", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, supplementNote: dto.supplementNote });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { costStatus: "PENDING_VERIFICATION" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, resultSummary: { status: "PENDING_VERIFICATION" } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_COST_RESUBMITTED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { batchId: dto.batchId, status: "PENDING_VERIFICATION" } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async submitPurchase(user: ReturnUser, id: string, dto: ReturnActionDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    await this.requireStore(user, parent.storeId, "PURCHASE");
    await this.requireAction(user, "create");
    if (parent.status !== "DRAFT") throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_SUBMIT", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { status: "SUBMITTED" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: "SUBMITTED", resultSummary: { status: "SUBMITTED" } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_SUBMITTED", targetType: "PurchaseReturn", targetId: id, metadata: { from: parent.status, to: "SUBMITTED" } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }

  async approvePurchase(user: ReturnUser, id: string, dto: { approvalType: "BUSINESS" | "FINANCIAL"; confirmedAmountCents?: number; idempotencyKey: string }) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    const financial = dto.approvalType === "FINANCIAL";
    if (financial) await this.requireStore(user, parent.storeId, "PURCHASE", true); else await this.requireStore(user, parent.storeId, "PURCHASE");
    if (!financial) await this.requireAction(user, "approve");
    if (parent.status !== "SUBMITTED") throw new BadRequestException("RETURN_INVALID_STATUS");
    const data = financial ? { financialApprovedById: user.id, confirmedAmountCents: dto.confirmedAmountCents ?? parent.requestedAmountCents } : { businessApprovedById: user.id };
    const both = financial ? Boolean(parent.businessApprovedById) : Boolean(parent.financialApprovedById);
    const actionType = financial ? "PURCHASE_FINANCIAL_APPROVE" : "PURCHASE_BUSINESS_APPROVE";
    const claim = await this.beginAction("PURCHASE", id, actionType, dto.idempotencyKey, user.id, { approvalType: dto.approvalType, confirmedAmountCents: dto.confirmedAmountCents });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { ...data, status: both ? "WAITING_OUTBOUND" : "SUBMITTED" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", approvalType: dto.approvalType, resultSummary: { status: updated.status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: dto.approvalType === "FINANCIAL" ? "PURCHASE_RETURN_FINANCIAL_APPROVED" : "PURCHASE_RETURN_BUSINESS_APPROVED", targetType: "PurchaseReturn", targetId: id, metadata: { status: updated.status, approvalType: dto.approvalType } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async settlePurchase(user: ReturnUser, id: string, dto: SettlePurchaseReturnDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    await this.requireStore(user, parent.storeId, "PURCHASE", true);
    if (!["WAITING_SETTLEMENT", "PARTIAL_SETTLEMENT"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const refund = dto.refundAmountCents ?? 0;
    const offset = dto.payableOffsetAmountCents ?? 0;
    const confirmed = parent.confirmedAmountCents ?? parent.requestedAmountCents;
    const previous = await this.prisma.supplierReturnSettlementAdjustment.findMany({ where: { purchaseReturnId: id, status: "CONFIRMED" } });
    const settled = previous.reduce((sum, item) => sum + item.refundAmountCents + item.payableOffsetAmountCents, 0);
    if (refund < 0 || offset < 0 || refund + offset <= 0 || settled + refund + offset > confirmed) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 结算金额不合法");
    if (settled + refund + offset < confirmed && !dto.differenceReason?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 部分结算必须填写差异原因");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_SETTLE", dto.idempotencyKey, user.id, { settlementMode: dto.settlementMode, refundAmountCents: refund, payableOffsetAmountCents: offset });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    const confirmedAt = new Date();
    return this.runTransaction(async (tx) => {
      const last = await tx.supplierReturnSettlementAdjustment.findFirst({ where: { purchaseReturnId: id }, orderBy: { sequenceNo: "desc" } });
      const adjustment = await tx.supplierReturnSettlementAdjustment.create({ data: { purchaseReturnId: id, supplierId: parent.supplierId, sequenceNo: (last?.sequenceNo ?? 0) + 1, status: "CONFIRMED", settlementMode: dto.settlementMode, refundAmountCents: refund, payableOffsetAmountCents: offset, exchangeQuantity: dto.exchangeQuantity, supplierDocumentNo: dto.supplierDocumentNo, differenceReason: dto.differenceReason, reason: dto.reason, createdById: user.id, confirmedById: user.id, confirmedAt, idempotencyKey: dto.idempotencyKey } });
      if (refund > 0) {
        const account = await tx.paymentAccount.findFirst({ where: { storeId: parent.executionStoreId, isActive: true, isDefault: true } });
        if (!account) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 未配置执行门店财务账户");
        const payment = await this.cashFactWriter.recordSupplierRefundPayout(toCashFactTransaction(tx), {
          storeId: parent.executionStoreId,
          accountId: account.id,
          amountCents: refund,
          sourceType: "SUPPLIER_RETURN_SETTLEMENT",
          sourceId: adjustment.id,
          note: dto.supplierDocumentNo,
          createdById: user.id,
          occurredAt: confirmedAt,
          idempotencyKey: `SUPPLIER_RETURN_SETTLEMENT:${id}:${dto.idempotencyKey}`
        });
        await tx.supplierReturnSettlementAdjustment.update({ where: { id: adjustment.id }, data: { paymentRecordId: payment.recordId } });
      }
      const total = settled + refund + offset;
      const status = total >= confirmed ? "SETTLED" : "PARTIAL_SETTLEMENT";
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { settledAmountCents: total, refundAmountCents: refund, payableOffsetCents: offset, status } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", settlementAdjustmentId: adjustment.id, resultSummary: { status, settledAmountCents: total } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_SETTLED", targetType: "SupplierReturnSettlementAdjustment", targetId: adjustment.id, metadata: { amount: refund + offset, settlementMode: dto.settlementMode } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async outboundPurchase(user: ReturnUser, id: string, detailId: string, quantity: number, dto: ReturnActionDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    const detail = await this.prisma.purchaseReturnDetail.findUnique({ where: { id: detailId } });
    if (!parent || !detail || detail.returnId !== id) throw new NotFoundException("采购退货明细不存在");
    await this.requireStore(user, parent.storeId, "PURCHASE");
    await this.requireAction(user, "manage");
    if (!["WAITING_OUTBOUND", "PARTIAL_OUTBOUND"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    if (quantity <= 0 || Number(detail.approvedQuantity ?? detail.quantity) - Number(detail.outboundQuantity) < quantity) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 出库数量超过可退数量");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_OUTBOUND", dto.idempotencyKey, user.id, { detailId, quantity });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      await this.inventoryLedger.outboundPurchaseReturnWithin(toInventoryLedgerTransaction(tx), {
        storeId: parent.executionStoreId,
        batchId: detail.batchId,
        quantity,
        returnId: id,
        sourceDetailId: detail.id,
        actorId: user.id
      });
      await tx.purchaseReturnDetail.update({ where: { id: detail.id }, data: { outboundQuantity: { increment: quantity } } });
      const all = await tx.purchaseReturnDetail.findMany({ where: { returnId: id } });
      const complete = all.every((item) => Number(item.outboundQuantity) >= Number(item.approvedQuantity ?? item.quantity));
      const status = complete ? "WAITING_SETTLEMENT" : "PARTIAL_OUTBOUND";
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { status } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, batchId: detail.batchId, resultSummary: { status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_OUTBOUND", targetType: "PurchaseReturnDetail", targetId: detail.id, metadata: { quantity, status, batchId: detail.batchId } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async reverseSettlement(user: ReturnUser, id: string, adjustmentId: string, dto: ReturnActionDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    await this.requireStore(user, parent.storeId, "PURCHASE", true);
    const adjustment = await this.prisma.supplierReturnSettlementAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment || adjustment.purchaseReturnId !== id || adjustment.status !== "CONFIRMED") throw new BadRequestException("RETURN_ALREADY_REVERSED");
    const claim = await this.beginAction("PURCHASE", id, "SETTLEMENT_REVERSE", dto.idempotencyKey, user.id, { adjustmentId, reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    const reversedAt = new Date();
    return this.runTransaction(async (tx) => {
      if (adjustment.paymentRecordId) {
        const original = await tx.paymentRecord.findUnique({ where: { id: adjustment.paymentRecordId } });
        if (!original || original.reversedById) throw new BadRequestException("RETURN_ALREADY_REVERSED");
        const reversal = await this.cashFactWriter.recordSupplierRefundReversal(toCashFactTransaction(tx), {
          storeId: original.storeId,
          accountId: original.accountId ?? undefined,
          amountCents: original.amountCents,
          sourceType: "SUPPLIER_RETURN_SETTLEMENT",
          sourceId: adjustment.id,
          note: dto.reason,
          createdById: user.id,
          occurredAt: reversedAt,
          idempotencyKey: `SUPPLIER_RETURN_SETTLEMENT_REVERSAL:${adjustment.id}:${dto.idempotencyKey}`,
          reversalOfId: original.id
        });
        await tx.paymentRecord.update({ where: { id: original.id }, data: { reversedById: reversal.recordId } });
      }
      await tx.supplierReturnSettlementAdjustment.update({ where: { id: adjustmentId }, data: { status: "REVERSED", reversedById: user.id, reversedAt } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", settlementAdjustmentId: adjustmentId, resultSummary: { status: "REVERSED" } } });
      const valid = await tx.supplierReturnSettlementAdjustment.findMany({ where: { purchaseReturnId: id, status: "CONFIRMED" } });
      const total = valid.reduce((sum, item) => sum + item.refundAmountCents + item.payableOffsetAmountCents, 0);
      const confirmed = parent.confirmedAmountCents ?? parent.requestedAmountCents;
      const status = total >= confirmed ? "SETTLED" : total > 0 ? "PARTIAL_SETTLEMENT" : "WAITING_SETTLEMENT";
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_SETTLEMENT_REVERSED", targetType: "SupplierReturnSettlementAdjustment", targetId: adjustment.id, metadata: { total, status } } });
      return tx.purchaseReturn.update({ where: { id }, data: { settledAmountCents: total, status } });
    }).catch((error) => this.failAction(actionId, error));
  }
  async detailSales(user: ReturnUser, id: string) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    await this.requireStore(user, parent.storeId, "SALES");
    return { ...parent, details: await this.prisma.salesReturnDetail.findMany({ where: { returnId: id } }), actions: await this.prisma.returnAction.findMany({ where: { returnType: "SALES", returnId: id }, orderBy: { createdAt: "asc" } }) };
  }

  async detailPurchase(user: ReturnUser, id: string) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    await this.requireStore(user, parent.storeId, "PURCHASE");
    return { ...parent, details: await this.prisma.purchaseReturnDetail.findMany({ where: { returnId: id } }), settlements: await this.prisma.supplierReturnSettlementAdjustment.findMany({ where: { purchaseReturnId: id }, orderBy: { sequenceNo: "asc" } }), actions: await this.prisma.returnAction.findMany({ where: { returnType: "PURCHASE", returnId: id }, orderBy: { createdAt: "asc" } }) };
  }

  async cancelPurchase(user: ReturnUser, id: string, dto: CancelReturnDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    await this.requireStore(user, parent.storeId, "PURCHASE");
    await this.requireAction(user, "manage");
    if (!["DRAFT", "SUBMITTED", "PARTIAL_OUTBOUND", "PARTIAL_SETTLEMENT"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_CANCEL", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.runTransaction(async (tx) => {
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { status: parent.status.startsWith("PARTIAL") ? "PARTIAL_CANCELLED" : "CANCELLED", cancelReason: dto.reason } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: updated.status, resultSummary: { status: updated.status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_CANCELLED", targetType: "PurchaseReturn", targetId: id, metadata: { status: updated.status, reason: dto.reason } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  private async transitionSales(user: ReturnUser, id: string, status: "SUBMITTED" | "APPROVED" | "CANCELLED", approvedById?: string) {
    const item = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("销售退货单不存在");
    await this.requireStore(user, item.storeId, "SALES");
    return this.prisma.salesReturn.update({ where: { id }, data: { status, approvedById } });
  }
  private async transitionPurchase(user: ReturnUser, id: string, status: "SUBMITTED" | "APPROVED", approvedById?: string) {
    const item = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("采购退货单不存在");
    await this.requireStore(user, item.storeId, "PURCHASE");
    return this.prisma.purchaseReturn.update({ where: { id }, data: { status, approvedById } });
  }}

/** Compatibility type alias for callers that still import the legacy name. */
export { ReturnsWorkflow as ReturnsService };
