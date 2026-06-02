import { IsOptional, IsString, IsInt, MaxLength, Min } from "class-validator";

export class ApplyInvoiceDto {
  @IsString()
  orderId!: string;

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
  note?: string;
}

export class InvoiceActionDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class ListInvoicesDto {
  @IsString()
  storeId!: string;
}
