import { Inject, Injectable } from "@nestjs/common";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { InventoryImplementation } from "./inventory-implementation";

export type { AuthenticatedInventoryUser } from "./inventory-implementation";

type MethodArgs<T> = T extends (...args: infer A) => unknown ? A : never;

/**
 * Compatibility adapter for the inventory backoffice surface.
 *
 * Stock-fact callers must use InventoryLedger. This adapter exists only for
 * the existing controller/backoffice API while that surface is migrated.
 */
@Injectable()
export class InventoryService {
  private readonly implementation: InventoryImplementation;

  constructor(
    @Inject(InventoryImplementation) implementationOrPrisma: InventoryImplementation | PrismaService,
    accessContext?: AccessContext
  ) {
    this.implementation = implementationOrPrisma instanceof InventoryImplementation
      ? implementationOrPrisma
      : new InventoryImplementation(implementationOrPrisma, accessContext as AccessContext);
  }

  listBatches(...args: MethodArgs<InventoryImplementation["listBatches"]>) { return this.implementation.listBatches(...args); }
  createBatch(...args: MethodArgs<InventoryImplementation["createBatch"]>) { return this.implementation.createBatch(...args); }
  listWarehouses(...args: MethodArgs<InventoryImplementation["listWarehouses"]>) { return this.implementation.listWarehouses(...args); }
  createWarehouse(...args: MethodArgs<InventoryImplementation["createWarehouse"]>) { return this.implementation.createWarehouse(...args); }
  updateWarehouse(...args: MethodArgs<InventoryImplementation["updateWarehouse"]>) { return this.implementation.updateWarehouse(...args); }
  listMovements(...args: MethodArgs<InventoryImplementation["listMovements"]>) { return this.implementation.listMovements(...args); }
  listSuppliers(...args: MethodArgs<InventoryImplementation["listSuppliers"]>) { return this.implementation.listSuppliers(...args); }
  createSupplier(...args: MethodArgs<InventoryImplementation["createSupplier"]>) { return this.implementation.createSupplier(...args); }
  updateSupplier(...args: MethodArgs<InventoryImplementation["updateSupplier"]>) { return this.implementation.updateSupplier(...args); }
  createSupplierContact(...args: MethodArgs<InventoryImplementation["createSupplierContact"]>) { return this.implementation.createSupplierContact(...args); }
  createSupplierRatingHistory(...args: MethodArgs<InventoryImplementation["createSupplierRatingHistory"]>) { return this.implementation.createSupplierRatingHistory(...args); }
  listPendingMatchOrders(...args: MethodArgs<InventoryImplementation["listPendingMatchOrders"]>) { return this.implementation.listPendingMatchOrders(...args); }
  getOrderInventoryMatch(...args: MethodArgs<InventoryImplementation["getOrderInventoryMatch"]>) { return this.implementation.getOrderInventoryMatch(...args); }
  createOrderInventoryAllocations(...args: MethodArgs<InventoryImplementation["createOrderInventoryAllocations"]>) { return this.implementation.createOrderInventoryAllocations(...args); }
  releaseOrderInventory(...args: MethodArgs<InventoryImplementation["releaseOrderInventory"]>) { return this.implementation.releaseOrderInventory(...args); }
  lockOrderInventory(...args: MethodArgs<InventoryImplementation["lockOrderInventory"]>) { return this.implementation.lockOrderInventory(...args); }
  outboundOrderInventory(...args: MethodArgs<InventoryImplementation["outboundOrderInventory"]>) { return this.implementation.outboundOrderInventory(...args); }
  convertBatchUnit(...args: MethodArgs<InventoryImplementation["convertBatchUnit"]>) { return this.implementation.convertBatchUnit(...args); }
  splitBatch(...args: MethodArgs<InventoryImplementation["splitBatch"]>) { return this.implementation.splitBatch(...args); }
  createStockOperation(...args: MethodArgs<InventoryImplementation["createStockOperation"]>) { return this.implementation.createStockOperation(...args); }
}
