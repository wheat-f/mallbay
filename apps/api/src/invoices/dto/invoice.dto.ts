import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsOptional, IsString, IsInt, MaxLength, Min, ValidateNested } from "class-validator";

export class InvoiceOrderAllocationDto {
  @IsString()
  orderId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class ApplyInvoiceDto {
  @IsOptional()
  @IsString()
  orderId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  orderIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => InvoiceOrderAllocationDto)
  allocations?: InvoiceOrderAllocationDto[];

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @IsString()
  taxNo?: string;

  @IsInt()
  @Min(1)
  amountCents!: number;
}

export class IssueInvoiceDto {
  @IsString()
  invoiceNo!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class InvoiceActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class SendInvoiceDto {
  @IsString()
  @MaxLength(120)
  recipient!: string;

  @IsString()
  @MaxLength(50)
  channel!: string;

  @IsOptional()
  @IsString()
  note?: string;
}

export class ListInvoicesDto {
  @IsString()
  storeId!: string;
}
