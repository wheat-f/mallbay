import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { PaymentAccountType } from "@prisma/client";

export class CreatePaymentAccountDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsEnum(PaymentAccountType)
  type!: PaymentAccountType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  bankName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountNo?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
