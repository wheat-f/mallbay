import { CustomerContactRole } from "@prisma/client";
import { IsBoolean, IsEnum, IsOptional, IsString, Matches, MaxLength } from "class-validator";

export class CreateCustomerUserDto {
  @IsString()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @Matches(/^1\d{10}$/)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  note?: string;

  @IsOptional()
  @IsEnum(CustomerContactRole)
  role?: CustomerContactRole;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateCustomerUserForCustomerDto extends CreateCustomerUserDto {
  @IsString()
  customerId!: string;
}
