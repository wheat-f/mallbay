import { DictionaryStatus } from "@prisma/client";
import { ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateDictionaryDto {
  @IsString()
  storeId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  code!: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  items!: string[];

  @IsOptional()
  @IsEnum(DictionaryStatus)
  status?: DictionaryStatus;
}

export class UpdateDictionaryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  items?: string[];

  @IsOptional()
  @IsEnum(DictionaryStatus)
  status?: DictionaryStatus;
}