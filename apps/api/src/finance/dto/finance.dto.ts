import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  FinanceApprovalStatus,
  PaymentDirection,
  PaymentRecordType,
} from "@prisma/client";

export class CreateExpenseDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class CreateReimbursementDto extends CreateExpenseDto {
  @IsOptional()
  @IsString()
  expenseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  exceptionReason?: string;
}

export class ReviewFinanceDto {
  @IsEnum(FinanceApprovalStatus)
  status!: FinanceApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListFinanceApplicationsDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsIn(["mine", "all"])
  scope?: "mine" | "all";

  @IsOptional()
  @IsEnum(FinanceApprovalStatus)
  status?: FinanceApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  keyword?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsEnum(PaymentDirection)
  direction?: PaymentDirection;

  @IsOptional()
  @IsEnum(PaymentRecordType)
  type?: PaymentRecordType;

  @IsOptional()
  @IsString()
  accountId?: string;

  @IsOptional()
  @IsString()
  dateFrom?: string;

  @IsOptional()
  @IsString()
  dateTo?: string;
}

export class ReviewExpenseDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReviewReimbursementDto {
  @IsIn(["APPROVE", "REJECT"])
  decision!: "APPROVE" | "REJECT";

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class PayReimbursementDto {
  @IsString()
  paymentAccountId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  paidAt?: string;
}

export class UploadFinanceAttachmentDto {
  @IsIn(["INVOICE", "CONTRACT", "PAYMENT_PROOF", "OTHER"])
  category!: "INVOICE" | "CONTRACT" | "PAYMENT_PROOF" | "OTHER";
}

export class WithdrawFinanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ResubmitExpenseDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ListFinanceDto extends ListFinanceApplicationsDto {}

export class ResubmitReimbursementDto {
  @IsString()
  @MaxLength(120)
  title!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  exceptionReason?: string;
}
