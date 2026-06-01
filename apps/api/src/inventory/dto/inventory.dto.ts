import { Type } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { ProductUnit } from "@prisma/client";

export class ListInventoryDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  productId?: string;
}

export class CreateInventoryBatchDto {
  @IsString()
  storeId!: string;

  @IsString()
  productId!: string;

  @IsString()
  @MaxLength(80)
  batchNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  totalQuantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostCents?: number;

  @IsOptional()
  @IsDateString()
  productionDate?: string;

  @IsOptional()
  @IsDateString()
  receivedAt?: string;
}

export class CreatePurchaseOrderItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitCostCents?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderItemDto)
  items!: CreatePurchaseOrderItemDto[];
}

export class ReceivePurchaseItemDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsString()
  batchNo!: string;

  @IsOptional()
  @IsString()
  supplierName?: string;
}

export class ConvertBatchUnitDto {
  @IsEnum(ProductUnit)
  fromUnit!: ProductUnit;

  @IsEnum(ProductUnit)
  toUnit!: ProductUnit;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  convertedQuantity!: number;
}
