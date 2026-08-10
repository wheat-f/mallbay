import { Injectable } from "@nestjs/common";
import { CustomersService, type AuthenticatedCustomerUser } from "../customers.service";
import type { CreateCustomerTagDto } from "../dto/create-customer-tag.dto";
import type { ListCustomerVehiclesDto } from "../dto/vehicle-lifecycle.dto";

export type CustomerAccountInput =
  | { operation: "create"; dto: CreateCustomerTagDto }
  | { operation: "delete"; id: string };

/** Customer/vehicle/tag read and maintenance seam. */
@Injectable()
export class CustomerAccount {
  constructor(private readonly implementation: CustomersService) {}

  getCustomerSummary(user: AuthenticatedCustomerUser, customerId: string) {
    return this.implementation.detail(user, customerId);
  }

  getVehicleSummary(user: AuthenticatedCustomerUser, customerId: string, query: ListCustomerVehiclesDto) {
    return this.implementation.listVehicles(user, customerId, query);
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
