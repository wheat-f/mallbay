import { DictionaryStatus } from "@prisma/client";
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class DictionaryTemplateItemInputDto {
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsString() parentId?: string | null;
}

export class CreateDictionaryTemplateDto {
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsArray() @ArrayMinSize(1) items!: DictionaryTemplateItemInputDto[];
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsBoolean() allowDisableItems?: boolean;
  @IsOptional() @IsBoolean() allowHierarchy?: boolean;
}

export class UpdateDictionaryTemplateDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsEnum(DictionaryStatus) status?: DictionaryStatus;
  @IsOptional() @IsBoolean() allowDisableItems?: boolean;
  @IsOptional() @IsBoolean() allowHierarchy?: boolean;
  @IsOptional() @IsInt() @Min(1) version?: number;
}

export class CreateDictionaryTemplateItemDto {
  @IsString() @MinLength(1) @MaxLength(80) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsString() parentId?: string | null;
}

export class SetDictionaryTemplateItemStatusDto {
  @IsEnum(DictionaryStatus) status!: DictionaryStatus;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(240) reason?: string;
  @IsOptional() @IsInt() @Min(1) version?: number;
}
export class UpdateDictionaryTemplateItemDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsString() parentId?: string | null;
  @IsOptional() @IsInt() @Min(1) version?: number;
}