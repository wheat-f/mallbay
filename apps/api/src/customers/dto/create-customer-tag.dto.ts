import { IsString, MaxLength } from "class-validator";

export class CreateCustomerTagDto {
  @IsString()
  customerId!: string;

  @IsString()
  @MaxLength(30)
  label!: string;
}
