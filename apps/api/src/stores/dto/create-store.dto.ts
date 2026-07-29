import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  managerId!: string; // 被指派为店长的用户 ID

  @IsOptional()
  @IsString()
  financialEntityId?: string;

  @IsOptional()
  @IsBoolean()
  crossStoreConstructionEnabled?: boolean;
}
