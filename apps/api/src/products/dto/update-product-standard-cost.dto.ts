import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

/** Finance-owned material cost. Product selling attributes are deliberately not accepted here. */
export class UpdateProductStandardCostDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  standardCostCents!: number;
}
