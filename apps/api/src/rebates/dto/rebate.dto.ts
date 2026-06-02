import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from "class-validator";
import { RebateStatus } from "@prisma/client";

export class ApplyRebateDto {
  @IsString()
  orderId!: string;

  @IsInt()
  @Min(1)
  amountCents!: number;

  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ReviewRebateDto {
  @IsEnum(RebateStatus)
  status!: RebateStatus;

  @IsOptional()
  @IsString()
  note?: string;
}

export class PayRebateDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class ListRebatesDto {
  @IsString()
  storeId!: string;
}
