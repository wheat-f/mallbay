import { DictionarySource, DictionaryStatus } from "@prisma/client";
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

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
}

export class UpdateDictionaryItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsString() @MaxLength(240) disabledReason?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}