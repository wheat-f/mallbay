import { IsEnum, IsString } from "class-validator";
import { PricingRolloutMode } from "@prisma/client";

export class SetPricingRolloutDto {
  @IsString()
  storeId!: string;

  @IsEnum(PricingRolloutMode)
  mode!: PricingRolloutMode;
}
