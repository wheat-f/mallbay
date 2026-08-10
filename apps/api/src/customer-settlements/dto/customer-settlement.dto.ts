import { Type } from "class-transformer";
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested
} from "class-validator";
import { CustomerReceiptStatus, CustomerStatementStatus } from "@prisma/client";

export class ListStatementCandidatesDto {
  @IsString()
  storeId!: string;

  @IsString()
  customerId!: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;

  @IsOptional()
  @IsDateString()
  periodEnd?: string;
}

export class ListCustomerStatementsDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(CustomerStatementStatus)
  status?: CustomerStatementStatus;
}

export class CreateCustomerStatementDto {
  @IsString()
  storeId!: string;

  @IsString()
  customerId!: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsString({ each: true })
  orderIds!: string[];
}

export class StatementActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class CustomerReceiptAllocationDto {
  @IsString()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class PreviewCustomerReceiptDto {
  @IsString()
  storeId!: string;

  @IsString()
  customerId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  orderIds?: string[];
}

export class CreateCustomerReceiptDto extends PreviewCustomerReceiptDto {
  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;

  @IsString()
  accountId!: string;

  @IsDateString()
  receivedAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  payerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  bankSerialNo?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomerReceiptAllocationDto)
  allocations?: CustomerReceiptAllocationDto[];
}

export class ListCustomerReceiptsDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsEnum(CustomerReceiptStatus)
  status?: CustomerReceiptStatus;
}

export class ReverseCustomerReceiptDto {
  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CustomerReceiptAllocationDto)
  allocations?: CustomerReceiptAllocationDto[];
}
