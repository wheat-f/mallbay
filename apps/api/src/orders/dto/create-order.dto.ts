import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { ConstructionLocation, ConstructionType, PaymentType } from "@prisma/client";

export class CreateOrderItemDto {
  @IsString()
  productId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 3 })
  @Min(0.001)
  quantity!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  unitPriceCents!: number;
}

export class CreateOrderDepositDto {
  @IsString()
  accountId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @IsDateString()
  paidAt!: string;
}

export class CreateOrderDto {
  @IsString()
  storeId!: string;

  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  vehicleId?: string;

  @IsEnum(ConstructionType)
  constructionType!: ConstructionType;

  @IsEnum(ConstructionLocation)
  constructionLocation!: ConstructionLocation;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  constructionAddress?: string;

  @IsOptional()
  @IsDateString()
  appointmentDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appointmentTimeSlot?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];

  /** Customer-facing construction service charge. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  constructionChargeCents?: number;

  /** @deprecated compatibility alias for constructionChargeCents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  laborCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  suggestedLaborCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  suggestedConstructionChargeCents?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  laborCostAdjustmentReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  constructionChargeAdjustmentReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;

  @IsOptional()
  @IsString()
  pricingCalculationId?: string;

  /** Internal conversion fields; normal clients should omit them. */
  @IsOptional()
  @IsString()
  capacityReservationId?: string;

  @IsOptional()
  @IsString()
  salesPersonId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedCostCents?: number;

  /** Client values are ignored; estimates are always reconstructed server-side. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedMaterialCostCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  estimatedConstructionCostCents?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => CreateOrderDepositDto)
  deposit?: CreateOrderDepositDto;
}
