import { Type } from "class-transformer";
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Min, ValidateNested } from "class-validator";
import { ProductUnit } from "@prisma/client";

export class ProductUnitSuggestedPriceInputDto {
  @IsEnum(ProductUnit)
  salesUnit!: ProductUnit;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  suggestedPriceCents!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateProductUnitSuggestedPricesDto {
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ProductUnitSuggestedPriceInputDto)
  prices!: ProductUnitSuggestedPriceInputDto[];
}
