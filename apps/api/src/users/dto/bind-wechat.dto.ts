import { IsString, MinLength } from "class-validator";

export class BindWechatDto {
  @IsString()
  @MinLength(1)
  openId!: string;
}
