import { IsString, Matches, MinLength, ValidateIf } from "class-validator";

export class RegisterDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_一-龥]{2,30}$/, {
    message: "账号只能包含字母、数字、下划线或中文，长度 2-30 位"
  })
  username!: string;

  @ValidateIf((dto: RegisterDto) => !dto.encryptedPassword)
  @IsString()
  @MinLength(8, { message: "密码至少 8 位" })
  password?: string;

  @ValidateIf((dto: RegisterDto) => !dto.password)
  @IsString({ message: "加密登录凭据不能为空" })
  encryptedPassword?: string;
}
