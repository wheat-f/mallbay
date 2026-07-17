import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { VEHICLE_TYPE_CODES } from "../../settings/dictionaries.service";

export class UpdateVehicleDto {
  @IsOptional()
  @IsString()
  @MaxLength(20)
  carPlate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  vin?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  carModel?: string;

  @IsOptional()
  @IsString()
  @IsIn(VEHICLE_TYPE_CODES)
  vehicleTypeCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  carColor?: string;

  @IsOptional()
  @IsString()
  photoUrl?: string;
}
