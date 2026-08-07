import { Injectable } from "@nestjs/common";
import { PricingService } from "../pricing.service";

type PricingUser = Parameters<PricingService["calculate"]>[0];
type PricingInput = Parameters<PricingService["calculate"]>[1];
type OrderValidationUser = Parameters<PricingService["validateOrder"]>[0];
type OrderValidationInput = Parameters<PricingService["validateOrder"]>[1];
type OrderValidationOptions = Parameters<PricingService["validateOrder"]>[2];

/** Single decision seam for quote/order price and cost snapshots. */
@Injectable()
export class PricingDecision {
  constructor(private readonly implementation: PricingService) {}

  decide(user: PricingUser, input: PricingInput) {
    return this.implementation.calculate(user, input);
  }

  validateOrder(
    user: OrderValidationUser,
    input: OrderValidationInput,
    options?: OrderValidationOptions
  ) {
    return this.implementation.validateOrder(user, input, options);
  }
}
