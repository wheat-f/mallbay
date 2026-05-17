import { IsArray, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

export class SubmitPhotoDto {
  @IsString()
  url!: string; // 已上传到 OSS 的 URL

  @IsOptional()
  isCover?: boolean;

  @IsOptional()
  order?: number;
}

export class SubmitStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmitPhotoDto)
  photos!: SubmitPhotoDto[]; // 1~5 张，在 service 层校验数量
}
