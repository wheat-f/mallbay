import { IsNotEmpty, IsOptional, IsString, IsUrl, MaxLength } from "class-validator";

export class TestOssConnectionDto {
  @IsString() @IsUrl({ require_tld: false }) endpoint!: string;
  @IsOptional() @IsString() @MaxLength(240) accessKey?: string;
  @IsOptional() @IsString() @MaxLength(240) secretKey?: string;
}