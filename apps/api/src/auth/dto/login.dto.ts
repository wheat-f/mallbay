import { IsString, MinLength, ValidateIf } from "class-validator";

export class LoginDto {
  /** 可以是 username、email 或 phone */
  @IsString()
  identifier!: string;

  @ValidateIf((dto: LoginDto) => !dto.encryptedPassword)
  @IsString()
  @MinLength(8, { message: "密码至少 8 位" })
  password?: string;

  @ValidateIf((dto: LoginDto) => !dto.password)
  @IsString({ message: "加密登录凭据不能为空" })
  encryptedPassword?: string;
}
