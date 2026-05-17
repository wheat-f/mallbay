import { IsString, MinLength } from "class-validator";

export class BindAlipayDto {
  @IsString()
  @MinLength(1)
  userId!: string;
}
