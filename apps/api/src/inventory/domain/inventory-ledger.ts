import { Injectable } from "@nestjs/common";
import { InventoryService, type AuthenticatedInventoryUser } from "../inventory.service";
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

/**
 * InventoryLedger is the single command/query seam for stock facts.
 * InventoryService remains the compatibility implementation during migration.
 */
@Injectable()
export class InventoryLedger {
  constructor(private readonly implementation: InventoryService) {}

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
}
