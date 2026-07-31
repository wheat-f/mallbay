import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from "class-validator";
import { PaymentType } from "@prisma/client";

export class CreateOrderPaymentDto {
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
  @IsString()
  accountId!: string;

  @IsEnum(PaymentType)
  paymentType!: PaymentType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  amountCents!: number;

  @IsDateString()
  paidAt!: string;
}
