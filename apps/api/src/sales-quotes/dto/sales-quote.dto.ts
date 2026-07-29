import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
import { ConstructionLocation, ConstructionType } from "@prisma/client";

export class CreateSalesQuoteItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalUnitPriceCents!: number;
}

export class CreateSalesQuoteDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  executionStoreId?: string;

  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsOptional()
  @IsDateString()
  appointmentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appointmentTimeSlot?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  constructionAddress?: string;

  @IsEnum(ConstructionType)
  constructionType!: ConstructionType;

  @IsEnum(ConstructionLocation)
  constructionLocation!: ConstructionLocation;

  @IsString()
  pricingCalculationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesQuoteItemDto)
  items!: CreateSalesQuoteItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalConstructionChargeCents?: number;

  /** @deprecated compatibility alias for finalConstructionChargeCents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalLaborCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  temporaryCostCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  temporaryCostReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  adjustmentReasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adjustmentReasonText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validHours?: number;

  @IsOptional()
  @IsBoolean()
  submitForApproval?: boolean;
}

export class ListSalesQuotesDto {
  @IsString()
  storeId!: string;
}

/** Full server-side, one-product-per-row export. */
export class ExportSalesQuoteDetailsDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsIn(["customer", "date", "product"])
  exportDimension?: "customer" | "date" | "product";
}

export class SubmitSalesQuoteDto {
  @IsString()
  storeId!: string;
}

export class ReviewSalesQuoteDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;
}

export class WithdrawSalesQuoteDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class RecalculateSalesQuoteDto {
  @IsString()
  storeId!: string;

  @IsString()
  pricingCalculationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalesQuoteItemDto)
  items!: CreateSalesQuoteItemDto[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalConstructionChargeCents?: number;

  /** @deprecated compatibility alias for finalConstructionChargeCents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalLaborCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  temporaryCostCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  temporaryCostReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  adjustmentReasonCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  adjustmentReasonText?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  validHours?: number;
}
