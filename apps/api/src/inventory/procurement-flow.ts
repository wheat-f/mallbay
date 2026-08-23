import { Injectable } from "@nestjs/common";
import { ProcurementImplementation } from "./procurement-implementation";
import type { AuthenticatedInventoryUser } from "./inventory.service";
import type {
  CreatePurchaseOrderDto,
  CreatePurchaseOrderFromRequirementDto,
  CreatePurchaseRequirementDto,
  CancelPurchaseOrderDto,
  ListPurchaseOrderExportDetailsDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  UpdatePurchaseReceiptCostDto
} from "./dto/inventory.dto";

/** Public seam for purchase requirements, orders and receipts. */
@Injectable()
export class ProcurementFlow {
  constructor(private readonly implementation: ProcurementImplementation) {}

  getOverview(user: AuthenticatedInventoryUser, storeId: string) { return this.implementation.getPurchaseOverview(user, storeId); }
  listRequirements(user: AuthenticatedInventoryUser, storeId: string) { return this.implementation.listPurchaseRequirements(user, storeId); }
  createRequirement(user: AuthenticatedInventoryUser, input: CreatePurchaseRequirementDto) { return this.implementation.createPurchaseRequirement(user, input); }
  createOrderFromRequirement(user: AuthenticatedInventoryUser, requirementId: string, input: CreatePurchaseOrderFromRequirementDto) {
    return this.implementation.createPurchaseOrderFromRequirement(user, requirementId, input);
  }
  listOrders(user: AuthenticatedInventoryUser, storeId: string) { return this.implementation.listPurchaseOrders(user, storeId); }
  exportOrderDetails(user: AuthenticatedInventoryUser, input: ListPurchaseOrderExportDetailsDto) { return this.implementation.exportPurchaseOrderDetails(user, input); }
  createOrder(user: AuthenticatedInventoryUser, input: CreatePurchaseOrderDto) { return this.implementation.createPurchaseOrder(user, input); }
  getOrder(user: AuthenticatedInventoryUser, orderId: string) { return this.implementation.getPurchaseOrder(user, orderId); }
  approveOrder(user: AuthenticatedInventoryUser, orderId: string) { return this.implementation.approvePurchaseOrder(user, orderId); }
  cancelOrder(user: AuthenticatedInventoryUser, orderId: string, input: CancelPurchaseOrderDto) {
    return this.implementation.cancelPurchaseOrder(user, orderId, input);
  }
  updateReceiptCost(user: AuthenticatedInventoryUser, receiptId: string, input: UpdatePurchaseReceiptCostDto) {
    return this.implementation.updatePurchaseReceiptCost(user, receiptId, input);
  }
  receive(user: AuthenticatedInventoryUser, itemId: string, input: ReceivePurchaseItemDto) { return this.implementation.receivePurchaseItem(user, itemId, input); }
  receiveBatches(user: AuthenticatedInventoryUser, itemId: string, input: ReceivePurchaseItemBatchesDto) {
    return this.implementation.receivePurchaseItemBatches(user, itemId, input);
  }
}
