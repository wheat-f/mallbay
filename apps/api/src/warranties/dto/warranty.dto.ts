import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CreateWarrantyDto {
  @IsString()
  orderId!: string;

  @IsString()
  @MaxLength(500)
  scope!: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class ListWarrantiesDto {
  @IsString()
  storeId!: string;
}
