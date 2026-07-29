import { SettingsMigrationReviewStatus } from "@prisma/client";
import { IsEnum, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class ResolveMigrationReviewDto {
  @IsEnum(SettingsMigrationReviewStatus)
  status!: SettingsMigrationReviewStatus;
  @IsString() @IsNotEmpty() @MaxLength(500)
  reason!: string;
}