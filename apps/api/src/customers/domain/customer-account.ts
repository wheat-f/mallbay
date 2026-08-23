import { Inject, Injectable } from "@nestjs/common";
import {
  CustomersService,
  type AuthenticatedCustomerUser
} from "../customers.service";
import type { CreateCustomerNoteDto } from "../dto/create-customer-note.dto";
import type { CreateCustomerTagDto } from "../dto/create-customer-tag.dto";
import type { CreateCustomerUserForCustomerDto } from "../dto/create-customer-user.dto";
import type { CreateCustomerDto } from "../dto/create-customer.dto";
import type { CreateVehicleDto } from "../dto/create-vehicle.dto";
import type { ListCustomersDto } from "../dto/list-customers.dto";
import type { UpdateCustomerDto } from "../dto/update-customer.dto";
import type { UpdateVehicleDto } from "../dto/update-vehicle.dto";
import type {
  ChangeVehicleStatusDto,
  ListCustomerVehiclesDto,
  TransferVehicleDto
} from "../dto/vehicle-lifecycle.dto";

export type { AuthenticatedCustomerUser } from "../customers.service";

export type CustomerAccountInput =
  | { operation: "create"; dto: CreateCustomerTagDto }
  | { operation: "delete"; id: string };

type CustomerAccountImplementation = Pick<
  CustomersService,
  | "create"
  | "list"
  | "search"
  | "detail"
  | "update"
  | "createVehicle"
  | "updateVehicle"
  | "listVehicles"
  | "changeVehicleStatus"
  | "transferVehicle"
  | "vehicleHistory"
  | "createCustomerUser"
  | "createNote"
  | "createTag"
  | "deleteTag"
>;

/**
 * Customer and vehicle account seam.
 *
 * CustomerAccount owns the caller-facing locality for customer/vehicle
 * relationship reads and lifecycle writes. CustomersService remains the
 * compatibility implementation behind this seam; orderContext deliberately
 * stays on that implementation because it belongs to order intake semantics.
 */
@Injectable()
export class CustomerAccount {
  constructor(@Inject(CustomersService) private readonly implementation: CustomerAccountImplementation) {}

  createCustomer(user: AuthenticatedCustomerUser, storeId: string, dto: CreateCustomerDto) {
    return this.implementation.create(user, storeId, dto);
  }

  listCustomers(user: AuthenticatedCustomerUser, dto: ListCustomersDto) {
    return this.implementation.list(user, dto);
  }

  searchCustomers(user: AuthenticatedCustomerUser, storeId: string, q: string) {
    return this.implementation.search(user, storeId, q);
  }

  getCustomerSummary(user: AuthenticatedCustomerUser, customerId: string) {
    return this.implementation.detail(user, customerId);
  }

  updateCustomer(user: AuthenticatedCustomerUser, customerId: string, dto: UpdateCustomerDto) {
    return this.implementation.update(user, customerId, dto);
  }

  createVehicle(user: AuthenticatedCustomerUser, dto: CreateVehicleDto) {
    return this.implementation.createVehicle(user, dto);
  }

  getVehicleSummary(
    user: AuthenticatedCustomerUser,
    customerId: string,
    query: ListCustomerVehiclesDto
  ) {
    return this.implementation.listVehicles(user, customerId, query);
  }

  updateVehicle(user: AuthenticatedCustomerUser, vehicleId: string, dto: UpdateVehicleDto) {
    return this.implementation.updateVehicle(user, vehicleId, dto);
  }

  changeVehicleStatus(
    user: AuthenticatedCustomerUser,
    vehicleId: string,
    status: "ACTIVE" | "INACTIVE",
    dto: ChangeVehicleStatusDto
  ) {
    return this.implementation.changeVehicleStatus(user, vehicleId, status, dto);
  }

  transferVehicle(user: AuthenticatedCustomerUser, vehicleId: string, dto: TransferVehicleDto) {
    return this.implementation.transferVehicle(user, vehicleId, dto);
  }

  getVehicleHistory(user: AuthenticatedCustomerUser, vehicleId: string) {
    return this.implementation.vehicleHistory(user, vehicleId);
  }

  createCustomerUser(user: AuthenticatedCustomerUser, dto: CreateCustomerUserForCustomerDto) {
    return this.implementation.createCustomerUser(user, dto);
  }

  createCustomerNote(user: AuthenticatedCustomerUser, dto: CreateCustomerNoteDto) {
    return this.implementation.createNote(user, dto);
  }

  maintainManualTags(
    user: AuthenticatedCustomerUser,
    input: CustomerAccountInput
  ) {
    return input.operation === "create"
      ? this.implementation.createTag(user, input.dto)
      : this.implementation.deleteTag(user, input.id);
  }
}
