import { DictionarySource, DictionaryStatus } from "@prisma/client";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsNotEmpty, MaxLength, Min, MinLength, IsIn } from "class-validator";
export class DictionaryCatalogQueryDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([20, 50, 100]) pageSize?: number;
}

export class DictionaryItemsQueryDto {
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsString() parentId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @IsIn([20, 50, 100]) pageSize?: number;
}

export class DictionaryItemInputDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsString() @MaxLength(240) disabledReason?: string;
}

export class CreateDictionaryDto {
  @IsString() storeId!: string;
  @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsArray() @ArrayMinSize(1) @IsString({ each: true }) items!: string[];
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsEnum(DictionarySource) source?: DictionarySource;
  @IsOptional() @IsBoolean() allowCustomItems?: boolean;
  @IsOptional() @IsBoolean() allowDisableItems?: boolean;
  @IsOptional() @IsBoolean() allowHierarchy?: boolean;
  @IsOptional() @IsArray() itemInputs?: DictionaryItemInputDto[];
}

export class UpdateDictionaryDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(80) name?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @IsString({ each: true }) items?: string[];
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsEnum(DictionarySource) source?: DictionarySource;
  @IsOptional() @IsBoolean() allowCustomItems?: boolean;
  @IsOptional() @IsBoolean() allowDisableItems?: boolean;
  @IsOptional() @IsBoolean() allowHierarchy?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
  @IsOptional() @IsArray() itemInputs?: DictionaryItemInputDto[];
}

export class CreateDictionaryItemDto extends DictionaryItemInputDto {}
export class SetDictionaryItemStatusDto {
  @IsEnum(DictionaryStatus) status!: DictionaryStatus;
  @IsOptional() @IsString() @MaxLength(240) reason?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class UpdateDictionaryItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsString() @MaxLength(240) disabledReason?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class ImportDictionaryItemsDto {
  @IsOptional() @IsString() storeId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) version?: number;
  @IsArray() @ArrayMinSize(1) items!: Array<{ code: string; name: string; sortOrder?: number; parentId?: string | null; status?: DictionaryStatus }>;
}

export class DeleteDictionaryItemDto {
  @IsString() @IsNotEmpty() @MaxLength(240) reason!: string;
}
export class DisableDictionaryDto {
  @IsString() @IsNotEmpty() @MaxLength(240) reason!: string;
}
