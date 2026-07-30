import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Prisma } from "@prisma/client";
import { canConfirmSupplierSettlement, canOperatePurchaseReturn, canOperateSalesReturn } from "./return-domain";
import { ApproveSalesReturnDto, CancelReturnDto, CostVerificationConfirmDto, CostVerificationResubmitDto, CostVerificationSubmitDto, CreatePurchaseReturnDto, CreateSalesReturnDto, InspectionApproveDto, InspectionConvertDto, ReceiveSalesReturnDto, RefundSalesReturnDto, ReturnActionDto, SettlePurchaseReturnDto } from "./dto/returns.dto";

export type ReturnUser = { id: string; isAdmin?: boolean; storeMember?: { storeId: string; position: string } };

@Injectable()
export class ReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  private role(user: ReturnUser) { return user.storeMember?.position ?? ""; }

  private requireRole(user: ReturnUser, allowed: string[]) {
    if (!user.isAdmin && !allowed.includes(this.role(user))) throw new ForbiddenException("RETURN_FORBIDDEN");
  }
  private requireStore(user: ReturnUser, storeId: string, kind: "SALES" | "PURCHASE", finance = false) {
    if (user.isAdmin) return;
    if (user.storeMember?.storeId !== storeId) throw new ForbiddenException("无权访问该门店退货");
    const role = user.storeMember.position;
    if (finance ? !canConfirmSupplierSettlement(role as never) : kind === "SALES" ? !canOperateSalesReturn(role) : !canOperatePurchaseReturn(role)) {
      throw new ForbiddenException("无权执行该退货操作");
    }
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
    this.requireStore(user, dto.storeId, "SALES");
    this.requireRole(user, ["MANAGER", "SALES", "CUSTOMER_SERVICE"]);
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: idempotencyKey 必填");
    if (!dto.details?.length) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 退货明细不能为空");
    const priorSales = await this.prisma.returnAction.findFirst({ where: { returnType: "SALES", actionType: "CREATE", idempotencyKey: dto.idempotencyKey } });
    if (priorSales) {
      if (JSON.stringify(priorSales.requestSummary ?? {}) !== JSON.stringify({ storeId: dto.storeId, orderId: dto.orderId })) throw new ConflictException("RETURN_IDEMPOTENCY_CONFLICT");
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
    const { created, action } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesReturn.create({ data: { storeId: dto.storeId, executionStoreId: dto.executionStoreId ?? order.executionStoreId, orderId: dto.orderId, returnNo, reason: dto.reason, returnMode: dto.returnMode ?? "PHYSICAL_RETURN", requestedRefundCents: total, remainingRefundCents: total, createdById: user.id } });
      const action = await tx.returnAction.create({ data: { returnType: "SALES", returnId: created.id, actionType: "CREATE", status: "PENDING", actorId: user.id, idempotencyKey: dto.idempotencyKey, requestSummary: { storeId: dto.storeId, orderId: dto.orderId } } });
      return { created, action };
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.salesReturnDetail.createMany({ data: details.map((item) => ({ ...item, returnId: created.id })) as never });
        await tx.returnAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", resultSummary: { id: created.id } } });
        await tx.auditEvent.create({ data: { actorId: user.id, storeId: created.storeId, action: "SALES_RETURN_CREATED", targetType: "SalesReturn", targetId: created.id, metadata: { status: created.status, orderId: created.orderId } } });
        return created;
      });
    } catch (error) {
      await this.prisma.salesReturn.update({ where: { id: created.id }, data: { status: "CANCELLED", cancelReason: "创建明细失败" } }).catch(() => undefined);
      return this.failAction(action.id, error);
    }
  }  async createPurchase(user: ReturnUser, dto: CreatePurchaseReturnDto) {
    this.requireStore(user, dto.storeId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (!dto.idempotencyKey?.trim()) throw new BadRequestException("RETURN_INVALID_ARGUMENT: idempotencyKey 必填");
    if (!dto.details?.length) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 退货明细不能为空");
    const priorPurchase = await this.prisma.returnAction.findFirst({ where: { returnType: "PURCHASE", actionType: "CREATE", idempotencyKey: dto.idempotencyKey } });
    if (priorPurchase) {
      if (JSON.stringify(priorPurchase.requestSummary ?? {}) !== JSON.stringify({ storeId: dto.storeId, purchaseOrderId: dto.purchaseOrderId })) throw new ConflictException("RETURN_IDEMPOTENCY_CONFLICT");
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
    const { created, action } = await this.prisma.$transaction(async (tx) => {
      const created = await tx.purchaseReturn.create({ data: { storeId: dto.storeId, executionStoreId: dto.executionStoreId ?? dto.storeId, purchaseOrderId: dto.purchaseOrderId, supplierId, supplierName, returnNo, reason: dto.reason, returnMode: dto.returnMode ?? "PHYSICAL_RETURN", settlementMode: dto.settlementMode ?? "PAYABLE_OFFSET", requestedAmountCents: total, totalAmountCents: total, createdById: user.id } });
      const action = await tx.returnAction.create({ data: { returnType: "PURCHASE", returnId: created.id, actionType: "CREATE", status: "PENDING", actorId: user.id, idempotencyKey: dto.idempotencyKey, requestSummary: { storeId: dto.storeId, purchaseOrderId: dto.purchaseOrderId } } });
      return { created, action };
    });
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.purchaseReturnDetail.createMany({ data: details.map((item) => ({ ...item, returnId: created.id })) as never });
        await tx.returnAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", resultSummary: { id: created.id } } });
        await tx.auditEvent.create({ data: { actorId: user.id, storeId: created.storeId, action: "PURCHASE_RETURN_CREATED", targetType: "PurchaseReturn", targetId: created.id, metadata: { status: created.status, purchaseOrderId: created.purchaseOrderId } } });
        return created;
      });
    } catch (error) {
      await this.prisma.purchaseReturn.update({ where: { id: created.id }, data: { status: "CANCELLED", cancelReason: "创建明细失败" } }).catch(() => undefined);
      return this.failAction(action.id, error);
    }
  }  listSales(user: ReturnUser, storeId: string) { this.requireStore(user, storeId, "SALES"); return this.prisma.salesReturn.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }); }
  listPurchase(user: ReturnUser, storeId: string) { this.requireStore(user, storeId, "PURCHASE"); return this.prisma.purchaseReturn.findMany({ where: { storeId }, orderBy: { createdAt: "desc" } }); }

  async submitSales(user: ReturnUser, id: string, dto: ReturnActionDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    this.requireStore(user, parent.storeId, "SALES");
    this.requireRole(user, ["MANAGER", "SALES", "CUSTOMER_SERVICE"]);
    if (parent.status !== "DRAFT") throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("SALES", id, "SALES_SUBMIT", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesReturn.update({ where: { id }, data: { status: "SUBMITTED" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: "SUBMITTED", resultSummary: { status: "SUBMITTED" } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_SUBMITTED", targetType: "SalesReturn", targetId: id, metadata: { from: parent.status, to: "SUBMITTED" } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async approveSales(user: ReturnUser, id: string, dto: ApproveSalesReturnDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    this.requireStore(user, parent.storeId, "SALES");
    this.requireRole(user, ["MANAGER"]);
    if (parent.status !== "SUBMITTED") throw new BadRequestException("RETURN_INVALID_STATUS");
    const amount = dto.approvedRefundAmountCents ?? parent.requestedRefundCents;
    if (amount < 0 || amount > parent.requestedRefundCents) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    const status = (dto.returnMode ?? parent.returnMode) === "REFUND_ONLY" ? "WAITING_REFUND" : "WAITING_RECEIPT";
    const claim = await this.beginAction("SALES", id, "SALES_APPROVE", dto.idempotencyKey, user.id, { approvedRefundAmountCents: dto.approvedRefundAmountCents, returnMode: dto.returnMode });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesReturn.update({ where: { id }, data: { status, approvedRefundCents: amount, remainingRefundCents: amount } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: status, resultSummary: { status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_APPROVED", targetType: "SalesReturn", targetId: id, metadata: { status, approvedRefundCents: amount } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async cancelSales(user: ReturnUser, id: string, dto: CancelReturnDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("销售退货单不存在");
    if (!user.isAdmin && this.role(user) !== "MANAGER") throw new ForbiddenException("RETURN_FORBIDDEN");
    if (!["DRAFT", "SUBMITTED", "PARTIAL_RECEIVED", "PARTIAL_REFUND"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("SALES", id, "SALES_CANCEL", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
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
    this.requireStore(user, parent.executionStoreId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (!["WAITING_RECEIPT", "PARTIAL_RECEIVED"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const remaining = Number(detail.approvedQuantity ?? detail.quantity) - Number(detail.receivedQuantity);
    if (dto.quantity <= 0 || dto.quantity > remaining) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 接收数量超过批准数量");
    const targetStatus = dto.targetStatus ?? "AVAILABLE";
    const claim = await this.beginAction("SALES", id, "SALES_RECEIVE", dto.idempotencyKey, user.id, { detailId: dto.detailId, quantity: dto.quantity, targetStatus });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const sourceBatch = detail.sourceOutboundBatchId ? await tx.inventoryBatch.findUnique({ where: { id: detail.sourceOutboundBatchId } }) : null;
      const unitCostCents = sourceBatch?.unitCostCents ?? 0;
      const batch = await tx.inventoryBatch.create({ data: { storeId: parent.executionStoreId, productId: detail.productId, batchNo: `RET-${Date.now()}-${detail.id.slice(-6)}`, unit: detail.salesUnit ?? sourceBatch?.unit ?? "ROLL", baseUnit: sourceBatch?.baseUnit ?? "PIECE", totalQuantity: dto.quantity, availableQuantity: targetStatus === "AVAILABLE" ? dto.quantity : 0, unitCostCents, sourceType: "SALES_RETURN", sourceId: id, inventoryStatus: targetStatus } });
      const received = Number(detail.receivedQuantity) + dto.quantity;
      await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { receivedQuantity: dto.quantity === 0 ? undefined : { increment: dto.quantity }, status: received >= Number(detail.approvedQuantity ?? detail.quantity) ? "RECEIVED" : "PARTIAL_RECEIVED", inspectionStatus: targetStatus, costStatus: sourceBatch ? "VERIFIED" : "PENDING_VERIFICATION", costAdjustmentCents: sourceBatch && targetStatus !== "DAMAGED" ? unitCostCents * dto.quantity : 0, inventoryBatchId: batch.id } });
      await tx.inventoryMovement.create({ data: { storeId: parent.executionStoreId, batchId: batch.id, productId: detail.productId, movementType: targetStatus === "DAMAGED" ? "DAMAGE_OUT" : "RETURN_IN", quantity: dto.quantity, unit: batch.unit, sourceType: "SALES_RETURN", sourceId: id, returnId: id, sourceDetailId: detail.id, note: targetStatus === "DAMAGED" ? "销售退货报损" : "销售退货收货", createdById: user.id } });
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
    this.requireStore(user, parent.storeId, "SALES", true);
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
    return this.prisma.$transaction(async (tx) => {
      const action = claim.action;
      if (amount > 0) await tx.paymentRecord.create({ data: { storeId: parent.executionStoreId, type: "CUSTOMER_RECEIPT_REVERSAL", direction: "EXPENSE", amountCents: amount, sourceType: "SALES_RETURN", sourceId: action.id, note: "销售退货线下退款", createdById: user.id } });
      if (amount > 0) {
        await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, type: "REVENUE_REVERSAL", amountCents: amount, originalValue: { approved: parent.approvedRefundCents }, newValue: { refunded: amount }, calculationBasis: { rule: "actual_refund" }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
        await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, type: "RECEIPT_REVERSAL", amountCents: amount, originalValue: { paid: parent.approvedRefundCents }, newValue: { reversed: amount }, calculationBasis: { rule: "actual_refund" }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
        if (commissionAdjustment > 0) await tx.returnFinancialAdjustment.create({ data: { storeId: parent.storeId, returnType: "SALES", returnId: id, type: "COMMISSION_REVERSAL", amountCents: commissionAdjustment, originalValue: { commissionCents: orderAmount?.salesCommissionCents ?? 0 }, newValue: { reversed: commissionAdjustment }, calculationBasis: { refundCents: amount, approvedRefundCents: parent.approvedRefundCents }, idempotencyKey: dto.idempotencyKey, createdById: user.id } });
      }
      const updated = await tx.salesReturn.update({ where: { id }, data: { status: left === 0 ? "REFUNDED" : "PARTIAL_REFUND", actualRefundCents: amount, refundedAmountCents: { increment: amount }, waivedRefundCents: { increment: waived }, remainingRefundCents: left, waiverReason: dto.waiverReason, refundMethod: dto.refundMethod, voucherId: dto.voucherId, refundedById: user.id, refundedAt: new Date() } });
      await tx.returnAction.update({ where: { id: action.id }, data: { status: "SUCCEEDED", resultSummary: { refundedAmountCents: amount, remainingRefundCents: left } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async approveInspection(user: ReturnUser, id: string, dto: InspectionApproveDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    if (!parent || !detail || detail.returnId !== id || detail.inspectionStatus !== "INSPECTION") throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    if (!user.isAdmin && !["MANAGER", "PURCHASING"].includes(this.role(user))) throw new ForbiddenException("RETURN_FORBIDDEN");
    if (dto.approvedQuantity <= 0 || dto.approvedQuantity > Number(detail.receivedQuantity)) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    const claim = await this.beginAction("SALES", id, "INSPECTION_APPROVE", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, targetStatus: dto.targetStatus, approvedQuantity: dto.approvedQuantity });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
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
    this.requireStore(user, parent.executionStoreId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (dto.quantity <= 0 || dto.quantity > Number(detail.inspectionApprovedQuantity ?? 0)) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    const claim = await this.beginAction("SALES", id, "INSPECTION_CONVERT", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, quantity: dto.quantity, targetStatus: dto.targetStatus });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const source = await tx.inventoryBatch.findUnique({ where: { id: detail.inventoryBatchId! } });
      if (!source || source.inventoryStatus !== "INSPECTION" || source.totalQuantity.toNumber() < dto.quantity) throw new BadRequestException("RETURN_INVALID_ARGUMENT");
      const child = await tx.inventoryBatch.create({ data: { storeId: source.storeId, productId: source.productId, batchNo: `RET-CONVERT-${Date.now()}`, unit: source.unit, baseUnit: source.baseUnit, totalQuantity: dto.quantity, availableQuantity: dto.targetStatus === "AVAILABLE" ? dto.quantity : 0, unitCostCents: source.unitCostCents, parentBatchId: source.id, sourceType: "SALES_RETURN_INSPECTION", sourceId: id, inventoryStatus: dto.targetStatus } });
      await tx.inventoryBatch.update({ where: { id: source.id }, data: { totalQuantity: { decrement: dto.quantity } } });
      await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { inspectionApprovalStatus: "EXECUTED" } });
      await tx.inventoryMovement.create({ data: { storeId: source.storeId, batchId: child.id, productId: source.productId, movementType: dto.targetStatus === "DAMAGED" ? "DAMAGE_OUT" : "STOCK_ADJUST", quantity: dto.quantity, unit: source.unit, sourceType: "SALES_RETURN_INSPECTION", sourceId: id, returnId: id, sourceDetailId: detail.id, createdById: user.id } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: source.storeId, action: "SALES_RETURN_INSPECTION_CONVERTED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { quantity: dto.quantity, targetStatus: dto.targetStatus, sourceBatchId: source.id, childBatchId: child.id } } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, batchId: child.id, resultSummary: { batchId: child.id, quantity: dto.quantity } } });
      return child;
    }).catch((error) => this.failAction(actionId, error));
  }

  async submitCostVerification(user: ReturnUser, id: string, dto: CostVerificationSubmitDto) {
    const parent = await this.prisma.salesReturn.findUnique({ where: { id } });
    const detail = await this.prisma.salesReturnDetail.findUnique({ where: { id: dto.returnDetailId } });
    if (!parent || !detail || detail.returnId !== id || !["PENDING_VERIFICATION", "REJECTED"].includes(String(detail.costStatus))) throw new BadRequestException("RETURN_INVALID_STATUS");
    this.requireStore(user, parent.storeId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    const claim = await this.beginAction("SALES", id, "COST_VERIFICATION_SUBMIT", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, batchId: dto.batchId, reason: dto.reason });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
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
    this.requireStore(user, parent.storeId, "SALES", true);
    const claim = await this.beginAction("SALES", id, "COST_VERIFICATION_CONFIRM", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, batchId: dto.batchId, verifiedUnitCostCents: dto.verifiedUnitCostCents });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
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
    this.requireStore(user, parent.storeId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    const claim = await this.beginAction("SALES", id, "COST_VERIFICATION_RESUBMIT", dto.idempotencyKey, user.id, { returnDetailId: dto.returnDetailId, supplementNote: dto.supplementNote });
    if (claim.replay) return claim.action;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.salesReturnDetail.update({ where: { id: detail.id }, data: { costStatus: "PENDING_VERIFICATION" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, resultSummary: { status: "PENDING_VERIFICATION" } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "SALES_RETURN_COST_RESUBMITTED", targetType: "SalesReturnDetail", targetId: detail.id, metadata: { batchId: dto.batchId, status: "PENDING_VERIFICATION" } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async submitPurchase(user: ReturnUser, id: string, dto: ReturnActionDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    this.requireStore(user, parent.storeId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (parent.status !== "DRAFT") throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_SUBMIT", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
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
    if (financial) this.requireStore(user, parent.storeId, "PURCHASE", true); else this.requireStore(user, parent.storeId, "PURCHASE");
    if (!financial) this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (parent.status !== "SUBMITTED") throw new BadRequestException("RETURN_INVALID_STATUS");
    const data = financial ? { financialApprovedById: user.id, confirmedAmountCents: dto.confirmedAmountCents ?? parent.requestedAmountCents } : { businessApprovedById: user.id };
    const both = financial ? Boolean(parent.businessApprovedById) : Boolean(parent.financialApprovedById);
    const actionType = financial ? "PURCHASE_FINANCIAL_APPROVE" : "PURCHASE_BUSINESS_APPROVE";
    const claim = await this.beginAction("PURCHASE", id, actionType, dto.idempotencyKey, user.id, { approvalType: dto.approvalType, confirmedAmountCents: dto.confirmedAmountCents });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { ...data, status: both ? "WAITING_OUTBOUND" : "SUBMITTED" } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", approvalType: dto.approvalType, resultSummary: { status: updated.status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: dto.approvalType === "FINANCIAL" ? "PURCHASE_RETURN_FINANCIAL_APPROVED" : "PURCHASE_RETURN_BUSINESS_APPROVED", targetType: "PurchaseReturn", targetId: id, metadata: { status: updated.status, approvalType: dto.approvalType } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async settlePurchase(user: ReturnUser, id: string, dto: SettlePurchaseReturnDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    this.requireStore(user, parent.storeId, "PURCHASE", true);
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
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.supplierReturnSettlementAdjustment.findFirst({ where: { purchaseReturnId: id }, orderBy: { sequenceNo: "desc" } });
      const adjustment = await tx.supplierReturnSettlementAdjustment.create({ data: { purchaseReturnId: id, supplierId: parent.supplierId, sequenceNo: (last?.sequenceNo ?? 0) + 1, status: "CONFIRMED", settlementMode: dto.settlementMode, refundAmountCents: refund, payableOffsetAmountCents: offset, exchangeQuantity: dto.exchangeQuantity, supplierDocumentNo: dto.supplierDocumentNo, differenceReason: dto.differenceReason, reason: dto.reason, createdById: user.id, confirmedById: user.id, confirmedAt: new Date(), idempotencyKey: dto.idempotencyKey } });
      if (refund > 0) {
        const account = await tx.paymentAccount.findFirst({ where: { storeId: parent.executionStoreId, isActive: true, isDefault: true } });
        if (!account) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 未配置执行门店财务账户");
        const payment = await tx.paymentRecord.create({ data: { storeId: parent.executionStoreId, accountId: account.id, type: "SUPPLIER_REFUND_OUT", direction: "OUTFLOW", amountCents: refund, sourceType: "SUPPLIER_RETURN_SETTLEMENT", sourceId: adjustment.id, note: dto.supplierDocumentNo, createdById: user.id } });
        await tx.supplierReturnSettlementAdjustment.update({ where: { id: adjustment.id }, data: { paymentRecordId: payment.id } });
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
    this.requireStore(user, parent.storeId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (!["WAITING_OUTBOUND", "PARTIAL_OUTBOUND"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    if (quantity <= 0 || Number(detail.approvedQuantity ?? detail.quantity) - Number(detail.outboundQuantity) < quantity) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 出库数量超过可退数量");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_OUTBOUND", dto.idempotencyKey, user.id, { detailId, quantity });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({ where: { id: detail.batchId } });
      if (!batch || batch.storeId !== parent.executionStoreId || batch.inventoryStatus !== "AVAILABLE" || batch.availableQuantity.toNumber() < quantity) throw new BadRequestException("RETURN_INVALID_ARGUMENT: 库存可用数量不足");
      await tx.inventoryBatch.update({ where: { id: batch.id }, data: { availableQuantity: { decrement: quantity }, outboundQuantity: { increment: quantity } } });
      await tx.purchaseReturnDetail.update({ where: { id: detail.id }, data: { outboundQuantity: { increment: quantity } } });
      await tx.inventoryMovement.create({ data: { storeId: parent.executionStoreId, batchId: batch.id, productId: batch.productId, movementType: "RETURN_OUT", quantity, unit: batch.unit, sourceType: "PURCHASE_RETURN", sourceId: id, returnId: id, sourceDetailId: detail.id, note: "采购退货出库", createdById: user.id } });
      const all = await tx.purchaseReturnDetail.findMany({ where: { returnId: id } });
      const complete = all.every((item) => Number(item.outboundQuantity) >= Number(item.approvedQuantity ?? item.quantity));
      const status = complete ? "WAITING_SETTLEMENT" : "PARTIAL_OUTBOUND";
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { status } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", returnDetailId: detail.id, batchId: batch.id, resultSummary: { status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_OUTBOUND", targetType: "PurchaseReturnDetail", targetId: detail.id, metadata: { quantity, status, batchId: batch.id } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  async reverseSettlement(user: ReturnUser, id: string, adjustmentId: string, dto: ReturnActionDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    this.requireStore(user, parent.storeId, "PURCHASE", true);
    const adjustment = await this.prisma.supplierReturnSettlementAdjustment.findUnique({ where: { id: adjustmentId } });
    if (!adjustment || adjustment.purchaseReturnId !== id || adjustment.status !== "CONFIRMED") throw new BadRequestException("RETURN_ALREADY_REVERSED");
    const claim = await this.beginAction("PURCHASE", id, "SETTLEMENT_REVERSE", dto.idempotencyKey, user.id, { adjustmentId, reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      if (adjustment.paymentRecordId) {
        const original = await tx.paymentRecord.findUnique({ where: { id: adjustment.paymentRecordId } });
        if (!original || original.reversedById) throw new BadRequestException("RETURN_ALREADY_REVERSED");
        const reversal = await tx.paymentRecord.create({ data: { storeId: original.storeId, accountId: original.accountId, type: "SUPPLIER_REFUND_REVERSAL", direction: "INFLOW", amountCents: original.amountCents, sourceType: "SUPPLIER_RETURN_SETTLEMENT", sourceId: adjustment.id, note: dto.reason, createdById: user.id, reversalOfId: original.id } });
        await tx.paymentRecord.update({ where: { id: original.id }, data: { reversedById: reversal.id } });
      }
      await tx.supplierReturnSettlementAdjustment.update({ where: { id: adjustmentId }, data: { status: "REVERSED", reversedById: user.id, reversedAt: new Date() } });
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
    this.requireStore(user, parent.storeId, "SALES");
    return { ...parent, details: await this.prisma.salesReturnDetail.findMany({ where: { returnId: id } }), actions: await this.prisma.returnAction.findMany({ where: { returnType: "SALES", returnId: id }, orderBy: { createdAt: "asc" } }) };
  }

  async detailPurchase(user: ReturnUser, id: string) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    this.requireStore(user, parent.storeId, "PURCHASE");
    return { ...parent, details: await this.prisma.purchaseReturnDetail.findMany({ where: { returnId: id } }), settlements: await this.prisma.supplierReturnSettlementAdjustment.findMany({ where: { purchaseReturnId: id }, orderBy: { sequenceNo: "asc" } }), actions: await this.prisma.returnAction.findMany({ where: { returnType: "PURCHASE", returnId: id }, orderBy: { createdAt: "asc" } }) };
  }

  async cancelPurchase(user: ReturnUser, id: string, dto: CancelReturnDto) {
    const parent = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!parent) throw new NotFoundException("采购退货单不存在");
    this.requireStore(user, parent.storeId, "PURCHASE");
    this.requireRole(user, ["MANAGER", "PURCHASING"]);
    if (!["DRAFT", "SUBMITTED", "PARTIAL_OUTBOUND", "PARTIAL_SETTLEMENT"].includes(parent.status)) throw new BadRequestException("RETURN_INVALID_STATUS");
    const claim = await this.beginAction("PURCHASE", id, "PURCHASE_CANCEL", dto.idempotencyKey, user.id, { reason: dto.reason });
    if (claim.replay) return parent;
    const actionId = claim.action.id;
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.purchaseReturn.update({ where: { id }, data: { status: parent.status.startsWith("PARTIAL") ? "PARTIAL_CANCELLED" : "CANCELLED", cancelReason: dto.reason } });
      await tx.returnAction.update({ where: { id: actionId }, data: { status: "SUCCEEDED", targetStatus: updated.status, resultSummary: { status: updated.status } } });
      await tx.auditEvent.create({ data: { actorId: user.id, storeId: parent.storeId, action: "PURCHASE_RETURN_CANCELLED", targetType: "PurchaseReturn", targetId: id, metadata: { status: updated.status, reason: dto.reason } } });
      return updated;
    }).catch((error) => this.failAction(actionId, error));
  }
  private async transitionSales(user: ReturnUser, id: string, status: "SUBMITTED" | "APPROVED" | "CANCELLED", approvedById?: string) {
    const item = await this.prisma.salesReturn.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("销售退货单不存在");
    this.requireStore(user, item.storeId, "SALES");
    return this.prisma.salesReturn.update({ where: { id }, data: { status, approvedById } });
  }
  private async transitionPurchase(user: ReturnUser, id: string, status: "SUBMITTED" | "APPROVED", approvedById?: string) {
    const item = await this.prisma.purchaseReturn.findUnique({ where: { id } });
    if (!item) throw new NotFoundException("采购退货单不存在");
    this.requireStore(user, item.storeId, "PURCHASE");
    return this.prisma.purchaseReturn.update({ where: { id }, data: { status, approvedById } });
  }}
