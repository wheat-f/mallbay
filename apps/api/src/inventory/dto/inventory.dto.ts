import { Type } from "class-transformer";
import {
  ArrayNotEmpty,
  ArrayMinSize,
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

export class ListWarehousesDto {
  @IsString()
  storeId!: string;
}

export class CreateWarehouseDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateWarehouseDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  area?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  address?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
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
  @IsString()
  @MaxLength(80)
  settlementCycle?: string;

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
  @IsString()
  @MaxLength(80)
  settlementCycle?: string;

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
  @IsNumber()
  @Min(0.001)
  totalQuantity!: number;

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @IsOptional()
  @IsEnum(ProductUnit)
  baseUnit?: ProductUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  baseQuantityPerPackage?: number;

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

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;
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

export class CreatePurchaseOrderSupplierAllocationItemDto {
  @IsString()
  purchaseRequirementItemId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;
}

export class CreatePurchaseOrderSupplierAllocationDto {
  @IsString()
  @MaxLength(120)
  supplierName!: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderSupplierAllocationItemDto)
  items!: CreatePurchaseOrderSupplierAllocationItemDto[];
}

export class CreatePurchaseOrderFromRequirementDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  supplierName?: string;

  @IsOptional()
  @IsDateString()
  expectedAt?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseOrderSupplierAllocationDto)
  supplierAllocations?: CreatePurchaseOrderSupplierAllocationDto[];
}

export class ReceivePurchaseItemDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsString()
  batchNo!: string;

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;

  @IsOptional()
  @IsEnum(ProductUnit)
  baseUnit?: ProductUnit;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  baseQuantityPerPackage?: number;

  @IsOptional()
  @IsString()
  supplierName?: string;

  @IsOptional()
  @IsString()
  warehouseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  warehouseName?: string;
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

  @IsOptional()
  @IsEnum(ProductUnit)
  unit?: ProductUnit;
}

export class CreateOrderInventoryAllocationsDto {
  @ValidateNested({ each: true })
  @Type(() => CreateOrderInventoryAllocationItemDto)
  allocations!: CreateOrderInventoryAllocationItemDto[];
}

export class OutboundOrderInventoryLineDto {
  @IsString()
  allocationId!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.001)
  quantity!: number;

  @IsEnum(ProductUnit)
  unit!: ProductUnit;
}

export class OutboundOrderInventoryDto {
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OutboundOrderInventoryLineDto)
  lines!: OutboundOrderInventoryLineDto[];
}
