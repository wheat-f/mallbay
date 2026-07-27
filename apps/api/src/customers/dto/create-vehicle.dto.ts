import { IsIn, IsOptional, IsString, MaxLength, ValidateIf } from "class-validator";
import { VEHICLE_TYPE_CODES } from "../../settings/dictionaries.service";

export class CreateVehicleDto {
  @IsString()
  customerId!: string;

  @ValidateIf((dto: CreateVehicleDto) => !dto.vin)
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

  @IsString()
  @IsIn(VEHICLE_TYPE_CODES)
  vehicleTypeCode!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carColor?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;

  @IsOptional()
  @IsString()
  defaultContactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  department?: string;
}
