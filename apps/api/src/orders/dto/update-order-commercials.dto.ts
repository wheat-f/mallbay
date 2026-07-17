import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { CreateOrderItemDto } from "./create-order.dto";

export class UpdateOrderCommercialsItemDto extends CreateOrderItemDto {
  @IsOptional()
  @IsString()
  id?: string;
}

export class UpdateOrderCommercialsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  changeReason!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => UpdateOrderCommercialsItemDto)
  items!: UpdateOrderCommercialsItemDto[];

  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  laborCostCents?: number;

  /** Customer-facing construction charge. Accept the old laborCostCents field for historic clients. */
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(0)
  constructionChargeCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
