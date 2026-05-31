import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf
} from "class-validator";
import { CustomerSourceType, CustomerType, Gender } from "@prisma/client";

export class CreateCustomerDto {
  @IsString()
  storeId!: string;

  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @ValidateIf((dto: CreateCustomerDto) => dto.customerType === CustomerType.PERSONAL)
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  birthday?: Date;

  @ValidateIf((dto: CreateCustomerDto) => dto.customerType === CustomerType.COMPANY)
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @ValidateIf((dto: CreateCustomerDto) => dto.customerType === CustomerType.COMPANY)
  @IsString()
  @MaxLength(50)
  contactPerson?: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wechat?: string;

  @IsOptional()
  @IsEnum(CustomerSourceType)
  sourceType?: CustomerSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceDetail?: string;

  @IsOptional()
  @IsString()
  referrerId?: string;
}
