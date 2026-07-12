import { Type } from "class-transformer";
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength
} from "class-validator";
import { CustomerSourceType, CustomerType, Gender } from "@prisma/client";

export class UpdateCustomerDto {
  @IsOptional()
  @IsEnum(CustomerType)
  customerType?: CustomerType;

  @IsOptional()
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

  @IsOptional()
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  contactPerson?: string;

  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/)
  phone?: string;

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
  referrerId?: string | null;
}
