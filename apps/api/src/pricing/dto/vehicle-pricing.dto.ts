import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

export class CreateVehiclePriceClassDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MaxLength(50)
  code!: string;

  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class CreateVehicleModelMappingDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  brand?: string;

  @IsString()
  @MaxLength(100)
  modelKeyword!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearFrom?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  yearTo?: number;

  @IsString()
  vehiclePriceClassId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  priority?: number;
}

export class ResolveVehiclePriceClassDto {
  @IsString()
  storeId!: string;

  @IsOptional()
  @IsString()
  brand?: string;

  @IsString()
  model!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @IsOptional()
  @IsString()
  manualVehiclePriceClassId?: string;
}

export class ListVehicleMappingsDto {
  @IsString()
  storeId!: string;
}

export class ImportVehicleModelMappingsDto {
  @IsString()
  storeId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateVehicleModelMappingDto)
  rows!: CreateVehicleModelMappingDto[];
}
