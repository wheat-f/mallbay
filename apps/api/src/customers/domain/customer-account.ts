import { Injectable } from "@nestjs/common";
import { CustomersService } from "../customers.service";

type CustomerUser = Parameters<CustomersService["detail"]>[0];

/** Customer/vehicle/tag read and maintenance seam. */
@Injectable()
export class CustomerAccount {
  constructor(private readonly implementation: CustomersService) {}

  getCustomerSummary(user: CustomerUser, customerId: string) {
    return this.implementation.detail(user, customerId);
  }

  getVehicleSummary(user: CustomerUser, customerId: string, query: Parameters<CustomersService["listVehicles"]>[2]) {
    return this.implementation.listVehicles(user, customerId, query);
  }

  maintainManualTags(
    user: CustomerUser,
    input: { operation: "create"; dto: Parameters<CustomersService["createTag"]>[1] } |
      { operation: "delete"; id: string }
  ) {
    return input.operation === "create"
      ? this.implementation.createTag(user, input.dto)
      : this.implementation.deleteTag(user, input.id);
  }
}
