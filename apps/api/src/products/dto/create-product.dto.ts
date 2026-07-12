import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { ProductCategory, ProductUnit } from "@prisma/client";

export class CreateProductDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(50)
  brand!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsString()
  @MaxLength(100)
  model!: string;

  @IsEnum(ProductCategory)
  category!: ProductCategory;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  specification?: string;

  @IsEnum(ProductUnit)
  unit!: ProductUnit;

  @IsOptional()
  @IsEnum(ProductUnit)
  inventoryUnit?: ProductUnit;

  @IsOptional()
  @IsEnum(ProductUnit)
  salesUnit?: ProductUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rollWidthMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  rollLengthMeters?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  metersPerRoll?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  quantityPrecision?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  warrantyYears?: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePriceCents!: number;
}
