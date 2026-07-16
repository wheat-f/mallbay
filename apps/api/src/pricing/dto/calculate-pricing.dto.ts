import { IsArray, IsDefined, IsObject, IsOptional, IsString } from "class-validator";
import type {
  PricingCalculationInput,
  PricingFinalAmountInput,
  PricingProtectionPolicy,
  PricingRule
} from "../domain/pricing-engine";

export class CalculatePricingDto {
  @IsString()
  storeId!: string;

  /** Draft/simulator input. Formal orders never trust this payload as a price snapshot. */
  @IsObject()
  input!: PricingCalculationInput;

  @IsOptional()
  @IsString()
  ruleSetId?: string;

  @IsOptional()
  @IsArray()
  rules?: PricingRule[];

  @IsOptional()
  @IsObject()
  finalAmount?: PricingFinalAmountInput;

  @IsOptional()
  @IsObject()
  protectionPolicy?: PricingProtectionPolicy;
}
