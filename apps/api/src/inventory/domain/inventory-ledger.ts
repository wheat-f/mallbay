import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InventoryMovementType, InventoryStatus, ProductUnit } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { InventoryImplementation } from "../inventory-implementation";
import type { AuthenticatedInventoryUser } from "../inventory-implementation";
import type {
  ConvertBatchUnitDto,
  CreateInventoryBatchDto,
  CreateOrderInventoryAllocationsDto,
  CreateStockOperationDto,
  ListInventoryDto,
  OutboundOrderInventoryDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  SplitBatchDto
} from "../dto/inventory.dto";

type InventoryUser = AuthenticatedInventoryUser;
type ReserveInput = CreateOrderInventoryAllocationsDto;
type ReceiveInput = ReceivePurchaseItemDto;
type ReceiveBatchesInput = ReceivePurchaseItemBatchesDto;
type OutboundInput = OutboundOrderInventoryDto;
type AdjustInput = CreateStockOperationDto;
type TraceInput = ListInventoryDto;
type BatchListInput = ListInventoryDto;
type CreateBatchInput = CreateInventoryBatchDto;
type ConvertBatchInput = ConvertBatchUnitDto;
type SplitBatchInput = SplitBatchDto;

export type InventoryLedgerTransaction = Prisma.TransactionClient;

export function toInventoryLedgerTransaction(transaction: unknown) {
  return transaction as InventoryLedgerTransaction;
}

type ReleaseWithinInput = {
  orderId: string;
  actorId: string;
  reasonCode: string;
};

type MaterialAllocation = {
  id: string;
  storeId: string;
  batchId: string;
  productId: string;
  batch: { unit: ProductUnit; batchNo: string };
};

type MaterialLossInput = {
  orderId: string;
  batchId: string;
  quantity: number;
  actorId: string;
  note?: string;
};

type SalesReturnReceiptInput = {
  storeId: string;
  productId: string;
  batchNo: string;
  unit: ProductUnit;
  baseUnit: ProductUnit;
  quantity: number;
  availableQuantity: number;
  unitCostCents: number;
  inventoryStatus: InventoryStatus;
  sourceId: string;
  returnId: string;
  sourceDetailId: string;
  actorId: string;
  note: string;
};

type SalesReturnInspectionInput = {
  sourceBatchId: string;
  quantity: number;
  targetStatus: InventoryStatus;
  sourceId: string;
  returnId: string;
  sourceDetailId: string;
  actorId: string;
};

type PurchaseReturnOutboundInput = {
  storeId: string;
  batchId: string;
  quantity: number;
  returnId: string;
  sourceDetailId: string;
  actorId: string;
};

/**
 * InventoryLedger is the single command/query seam for stock facts.
 * InventoryImplementation remains an internal persistence implementation; callers
 * must use this seam for stock-fact writes.
 */
@Injectable()
export class InventoryLedger {
  constructor(private readonly implementation: InventoryImplementation) {}

  reserve(user: InventoryUser, input: { orderId: string; allocations: ReserveInput }) {
    return this.implementation.createOrderInventoryAllocations(user, input.orderId, input.allocations);
  }

  release(user: InventoryUser, input: { orderId: string }) {
    return this.implementation.releaseOrderInventory(user, input.orderId);
  }

  receive(user: InventoryUser, input: { purchaseOrderItemId: string; receipt: ReceiveInput }) {
    return this.implementation.receivePurchaseItem(user, input.purchaseOrderItemId, input.receipt);
  }

  receiveBatches(user: InventoryUser, input: { purchaseOrderItemId: string; receipt: ReceiveBatchesInput }) {
    return this.implementation.receivePurchaseItemBatches(user, input.purchaseOrderItemId, input.receipt);
  }

  outbound(user: InventoryUser, input: { orderId: string; outbound?: OutboundInput }) {
    return this.implementation.outboundOrderInventory(user, input.orderId, input.outbound);
  }

  adjust(user: InventoryUser, input: AdjustInput) {
    return this.implementation.createStockOperation(user, input);
  }

  trace(user: InventoryUser, query: TraceInput) {
    return this.implementation.listMovements(user, query);
  }

  listBatches(user: InventoryUser, query: BatchListInput) {
    return this.implementation.listBatches(user, query);
  }

  receiveBatch(user: InventoryUser, input: CreateBatchInput) {
    return this.implementation.createBatch(user, input);
  }

  convertBatch(user: InventoryUser, batchId: string, input: ConvertBatchInput) {
    return this.implementation.convertBatchUnit(user, batchId, input);
  }

  splitBatch(user: InventoryUser, batchId: string, input: SplitBatchInput) {
    return this.implementation.splitBatch(user, batchId, input);
  }

  pendingMatches(user: InventoryUser, storeId: string) {
    return this.implementation.listPendingMatchOrders(user, storeId);
  }

  orderMatch(user: InventoryUser, orderId: string) {
    return this.implementation.getOrderInventoryMatch(user, orderId);
  }

  async releaseWithin(transaction: InventoryLedgerTransaction, input: ReleaseWithinInput) {
    const allocations = await transaction.orderInventoryAllocation.findMany({ where: { orderId: input.orderId, status: "LOCKED" } });
    let released = 0;
    for (const allocation of allocations) {
      const quantity = toNumber(allocation.lockedQuantity) - toNumber(allocation.outboundQuantity);
      if (quantity <= 0) continue;
      await transaction.inventoryBatch.update({
        where: { id: allocation.batchId },
        data: { availableQuantity: { increment: quantity }, lockedQuantity: { decrement: quantity } }
      });
      await transaction.orderInventoryAllocation.update({ where: { id: allocation.id }, data: { status: "RELEASED" } });
      await transaction.inventoryMovement.create({
        data: {
          storeId: allocation.storeId,
          batchId: allocation.batchId,
          productId: allocation.productId,
          orderId: input.orderId,
          movementType: InventoryMovementType.STOCK_RELEASE,
          quantity,
          sourceType: "ORDER_LIFECYCLE_RELEASE",
          sourceId: allocation.id,
          idempotencyKey: input.reasonCode,
          createdById: input.actorId,
          note: input.reasonCode
        }
      });
      released += 1;
    }
    return { released, allocationIds: allocations.map((allocation) => allocation.id) };
  }

  verifyMaterialWithin(transaction: InventoryLedgerTransaction, input: { allocationId: string; orderId: string; batchId: string; productId: string; storeId: string; unit: ProductUnit; actorId: string; note: string }) {
    return transaction.inventoryMovement.create({
      data: {
        storeId: input.storeId,
        batchId: input.batchId,
        productId: input.productId,
        orderId: input.orderId,
        movementType: InventoryMovementType.STOCK_ADJUST,
        quantity: 0,
        unit: input.unit,
        sourceType: "CONSTRUCTION_MATERIAL_VERIFY",
        sourceId: input.allocationId,
        createdById: input.actorId,
        note: input.note
      }
    });
  }

  pickupMaterialsWithin(transaction: InventoryLedgerTransaction, input: { orderId: string; allocations: MaterialAllocation[]; actorId: string; note?: string }) {
    return transaction.inventoryMovement.createMany({
      data: input.allocations.map((allocation) => ({
        storeId: allocation.storeId,
        batchId: allocation.batchId,
        productId: allocation.productId,
        orderId: input.orderId,
        movementType: InventoryMovementType.STOCK_ADJUST,
        quantity: 0,
        unit: allocation.batch.unit,
        sourceType: "CONSTRUCTION_MATERIAL_PICKUP",
        sourceId: allocation.id,
        createdById: input.actorId,
        note: input.note ?? `施工领取物料：${allocation.batch.batchNo}`
      }))
    });
  }

  async recordMaterialLossWithin(transaction: InventoryLedgerTransaction, input: MaterialLossInput) {
    const batch = await transaction.inventoryBatch.findFirst({ where: { id: input.batchId, allocations: { some: { orderId: input.orderId } } } });
    if (!batch) throw new NotFoundException("订单未锁定该批次");
    if (input.quantity > toNumber(batch.availableQuantity)) throw new BadRequestException("损耗数量超出可用库存");
    await transaction.inventoryBatch.update({
      where: { id: batch.id },
      data: { availableQuantity: { decrement: input.quantity }, outboundQuantity: { increment: input.quantity } }
    });
    return transaction.inventoryMovement.create({
      data: {
        storeId: batch.storeId,
        batchId: batch.id,
        productId: batch.productId,
        orderId: input.orderId,
        movementType: InventoryMovementType.DAMAGE_OUT,
        quantity: input.quantity,
        unit: batch.unit,
        sourceType: "CONSTRUCTION_MATERIAL_LOSS",
        sourceId: input.orderId,
        createdById: input.actorId,
        note: input.note ?? "施工现场损耗"
      }
    });
  }

  async receiveSalesReturnWithin(transaction: InventoryLedgerTransaction, input: SalesReturnReceiptInput) {
    const batch = await transaction.inventoryBatch.create({
      data: {
        storeId: input.storeId,
        productId: input.productId,
        batchNo: input.batchNo,
        unit: input.unit,
        baseUnit: input.baseUnit,
        totalQuantity: input.quantity,
        availableQuantity: input.availableQuantity,
        unitCostCents: input.unitCostCents,
        sourceType: "SALES_RETURN",
        sourceId: input.sourceId,
        inventoryStatus: input.inventoryStatus
      }
    });
    await transaction.inventoryMovement.create({
      data: {
        storeId: input.storeId,
        batchId: batch.id,
        productId: input.productId,
        movementType: input.inventoryStatus === "DAMAGED" ? InventoryMovementType.DAMAGE_OUT : InventoryMovementType.RETURN_IN,
        quantity: input.quantity,
        unit: batch.unit,
        sourceType: "SALES_RETURN",
        sourceId: input.sourceId,
        returnId: input.returnId,
        sourceDetailId: input.sourceDetailId,
        note: input.note,
        createdById: input.actorId
      }
    });
    return batch;
  }

  async convertSalesReturnInspectionWithin(transaction: InventoryLedgerTransaction, input: SalesReturnInspectionInput) {
    const source = await transaction.inventoryBatch.findUnique({ where: { id: input.sourceBatchId } });
    if (!source || source.inventoryStatus !== "INSPECTION" || toNumber(source.totalQuantity) < input.quantity) {
      throw new BadRequestException("RETURN_INVALID_ARGUMENT");
    }
    const child = await transaction.inventoryBatch.create({
      data: {
        storeId: source.storeId,
        productId: source.productId,
        batchNo: `RET-CONVERT-${Date.now()}`,
        unit: source.unit,
        baseUnit: source.baseUnit,
        totalQuantity: input.quantity,
        availableQuantity: input.targetStatus === "AVAILABLE" ? input.quantity : 0,
        unitCostCents: source.unitCostCents,
        parentBatchId: source.id,
        sourceType: "SALES_RETURN_INSPECTION",
        sourceId: input.sourceId,
        inventoryStatus: input.targetStatus
      }
    });
    await transaction.inventoryBatch.update({ where: { id: source.id }, data: { totalQuantity: { decrement: input.quantity } } });
    await transaction.inventoryMovement.create({
      data: {
        storeId: source.storeId,
        batchId: child.id,
        productId: source.productId,
        movementType: input.targetStatus === "DAMAGED" ? InventoryMovementType.DAMAGE_OUT : InventoryMovementType.STOCK_ADJUST,
        quantity: input.quantity,
        unit: source.unit,
        sourceType: "SALES_RETURN_INSPECTION",
        sourceId: input.sourceId,
        returnId: input.returnId,
        sourceDetailId: input.sourceDetailId,
        createdById: input.actorId
      }
    });
    return child;
  }

  async outboundPurchaseReturnWithin(transaction: InventoryLedgerTransaction, input: PurchaseReturnOutboundInput) {
    const batch = await transaction.inventoryBatch.findUnique({ where: { id: input.batchId } });
    if (!batch || batch.storeId !== input.storeId || batch.inventoryStatus !== "AVAILABLE" || toNumber(batch.availableQuantity) < input.quantity) {
      throw new BadRequestException("RETURN_INVALID_ARGUMENT: 库存可用数量不足");
    }
    await transaction.inventoryBatch.update({
      where: { id: batch.id },
      data: { availableQuantity: { decrement: input.quantity }, outboundQuantity: { increment: input.quantity } }
    });
    return transaction.inventoryMovement.create({
      data: {
        storeId: input.storeId,
        batchId: batch.id,
        productId: batch.productId,
        movementType: InventoryMovementType.RETURN_OUT,
        quantity: input.quantity,
        unit: batch.unit,
        sourceType: "PURCHASE_RETURN",
        sourceId: input.returnId,
        returnId: input.returnId,
        sourceDetailId: input.sourceDetailId,
        note: "采购退货出库",
        createdById: input.actorId
      }
    });
  }
}

function toNumber(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return Number(value);
}
