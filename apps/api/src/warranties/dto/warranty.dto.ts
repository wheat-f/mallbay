import { IsString } from "class-validator";

export class ListWarrantiesDto {
  @IsString()
  storeId!: string;
}
