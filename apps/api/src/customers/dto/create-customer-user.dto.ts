import { IsOptional, IsString, Matches, MaxLength } from "class-validator";

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
}

export class CreateCustomerUserForCustomerDto extends CreateCustomerUserDto {
  @IsString()
  customerId!: string;
}
