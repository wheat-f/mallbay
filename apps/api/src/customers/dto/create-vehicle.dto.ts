import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateVehicleDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  carPlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vin?: string;

  @IsString()
  @MaxLength(100)
  carModel!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carColor?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
