import { Type } from "class-transformer";
import type { ProductUnit } from "@prisma/client";
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";

export class EstimateCostLineDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  salesUnit?: ProductUnit;
}

export class EstimateCostDto {
  @IsString()
  storeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EstimateCostLineDto)
  lines!: EstimateCostLineDto[];

}
