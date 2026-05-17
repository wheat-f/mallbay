import { IsString, MaxLength, MinLength } from "class-validator";

export class CreateStoreDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  managerId!: string; // 被指派为店长的用户 ID
}
