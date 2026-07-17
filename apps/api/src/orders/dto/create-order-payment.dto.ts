import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsString, Min } from "class-validator";
import { PaymentType } from "@prisma/client";

export class CreateOrderPaymentDto {
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
