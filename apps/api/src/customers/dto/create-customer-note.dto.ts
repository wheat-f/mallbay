import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { CustomerNoteType } from "@prisma/client";

export class CreateCustomerNoteDto {
  @IsString()
  customerId!: string;

  @IsOptional()
  @IsEnum(CustomerNoteType)
  noteType?: CustomerNoteType;

  @IsString()
  @MaxLength(1000)
  content!: string;
}
