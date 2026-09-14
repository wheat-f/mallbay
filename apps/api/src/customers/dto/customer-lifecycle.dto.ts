import { IsOptional, IsString, MaxLength } from "class-validator";

export class CustomerLifecycleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
