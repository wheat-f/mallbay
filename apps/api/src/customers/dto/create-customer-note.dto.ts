import { IsString, MaxLength } from "class-validator";

export class CreateCustomerNoteDto {
  @IsString()
  customerId!: string;

  @IsString()
  @MaxLength(1000)
  content!: string;
}
