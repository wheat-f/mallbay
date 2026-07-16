import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";
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

  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalLaborCostCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

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

  @Type(() => Number)
  @IsInt()
  @Min(0)
  finalLaborCostCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

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
