import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { FinanceApprovalStatus } from "@prisma/client";

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
}

export class ReviewFinanceDto {
  @IsEnum(FinanceApprovalStatus)
  status!: FinanceApprovalStatus;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ListFinanceDto {
  @IsString()
  storeId!: string;
}
