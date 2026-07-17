import { IsIn, IsNotEmpty, IsString, MaxLength } from "class-validator";

export class CreateOrderAmendmentRequestDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class ReviewOrderAmendmentRequestDto {
  @IsIn(["APPROVE", "REJECT"])
  action!: "APPROVE" | "REJECT";

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reviewNote!: string;
}
