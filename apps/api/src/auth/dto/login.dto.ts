import { IsString, MinLength } from "class-validator";

export class LoginDto {
  /** 可以是 username、email 或 phone */
  @IsString()
  identifier!: string;

  @IsString()
  @MinLength(8, { message: "密码至少 8 位" })
  password!: string;
}
