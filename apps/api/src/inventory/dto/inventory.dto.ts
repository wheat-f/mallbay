import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  IsDateString,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { InventoryMovementType, ProductUnit } from "@prisma/client";

export class ListInventoryDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  productId?: string;

  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsEnum(InventoryMovementType)
  movementType?: InventoryMovementType;

  @IsOptional()
  @IsString()
  createdById?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;
}

export class ListSuppliersDto {
  @IsString()
  storeId!: string;
}

export class CreateSupplierDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class UpdateSupplierDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rating?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateSupplierContactDto {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  role?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateSupplierRatingHistoryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
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

export class CancelPurchaseOrderDto {
  @IsString()
  @MaxLength(300)
  reason!: string;
}

export class CreatePurchaseRequirementItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsString()
  orderItemId?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  requiredQuantity!: number;

  @IsEnum(ProductUnit)
  requiredUnit!: ProductUnit;
}

export class CreatePurchaseRequirementDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  sourceOrderId?: string;

  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseRequirementItemDto)
  items!: CreatePurchaseRequirementItemDto[];
}

export class CreatePurchaseOrderFromRequirementDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;
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

export class ReceivePurchaseItemBatchesDto {
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseItemDto)
  batches!: ReceivePurchaseItemDto[];
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

export class SplitBatchDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantityMeters!: number;
}

export class CreateStockOperationDto {
  @IsString()
  batchId!: string;

  @IsEnum(InventoryMovementType)
  movementType!: InventoryMovementType;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;
}

export class CreateOrderInventoryAllocationItemDto {
  @IsString()
  orderItemId!: string;

  @IsString()
  batchId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreateOrderInventoryAllocationsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateOrderInventoryAllocationItemDto)
  allocations!: CreateOrderInventoryAllocationItemDto[];
}
