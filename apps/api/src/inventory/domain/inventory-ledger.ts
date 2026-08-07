import { Injectable } from "@nestjs/common";
import { InventoryService } from "../inventory.service";

type InventoryUser = Parameters<InventoryService["createOrderInventoryAllocations"]>[0];
type ReserveInput = Parameters<InventoryService["createOrderInventoryAllocations"]>[2];
type ReceiveInput = Parameters<InventoryService["receivePurchaseItem"]>[2];
type ReceiveBatchesInput = Parameters<InventoryService["receivePurchaseItemBatches"]>[2];
type OutboundInput = Parameters<InventoryService["outboundOrderInventory"]>[2];
type AdjustInput = Parameters<InventoryService["createStockOperation"]>[1];
type TraceInput = Parameters<InventoryService["listMovements"]>[1];

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
}
