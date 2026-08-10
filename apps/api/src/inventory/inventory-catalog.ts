import { Injectable } from "@nestjs/common";
import { InventoryService, type AuthenticatedInventoryUser } from "./inventory.service";
import type {
  CreateSupplierContactDto,
  CreateSupplierRatingHistoryDto,
  CreateSupplierDto,
  CreateWarehouseDto,
  UpdateSupplierDto,
  UpdateWarehouseDto
} from "./dto/inventory.dto";

/**
 * Public boundary for inventory and procurement master data.
 *
 * Controllers should not know that the current implementation also contains
 * stock commands and purchase workflows. Keeping this interface narrow makes
 * the eventual InventoryService extraction a replaceable migration detail.
 */
@Injectable()
export class InventoryCatalog {
  constructor(private readonly implementation: InventoryService) {}

  listWarehouses(user: AuthenticatedInventoryUser, storeId: string) {
    return this.implementation.listWarehouses(user, storeId);
  }

  createWarehouse(user: AuthenticatedInventoryUser, input: CreateWarehouseDto) {
    return this.implementation.createWarehouse(user, input);
  }

  updateWarehouse(user: AuthenticatedInventoryUser, warehouseId: string, input: UpdateWarehouseDto) {
    return this.implementation.updateWarehouse(user, warehouseId, input);
  }

  listSuppliers(user: AuthenticatedInventoryUser, storeId: string) {
    return this.implementation.listSuppliers(user, storeId);
  }

  createSupplier(user: AuthenticatedInventoryUser, input: CreateSupplierDto) {
    return this.implementation.createSupplier(user, input);
  }

  updateSupplier(user: AuthenticatedInventoryUser, supplierId: string, input: UpdateSupplierDto) {
    return this.implementation.updateSupplier(user, supplierId, input);
  }

  createSupplierContact(user: AuthenticatedInventoryUser, supplierId: string, input: CreateSupplierContactDto) {
    return this.implementation.createSupplierContact(user, supplierId, input);
  }

  createSupplierRatingHistory(
    user: AuthenticatedInventoryUser,
    supplierId: string,
    input: CreateSupplierRatingHistoryDto
  ) {
    return this.implementation.createSupplierRatingHistory(user, supplierId, input);
  }
}
