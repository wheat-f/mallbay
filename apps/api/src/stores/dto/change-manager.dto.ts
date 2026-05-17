import { IsString } from "class-validator";

export class ChangeManagerDto {
  @IsString()
  newManagerId!: string;
}
