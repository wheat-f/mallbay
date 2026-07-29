import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateFinancialEntityDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  code!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}

export class UpdateStoreCrossStoreConfigDto {
  @IsString()
  @IsNotEmpty()
  financialEntityId!: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}
