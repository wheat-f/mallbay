import { IsEnum, IsString } from "class-validator";
import { StorePosition } from "@prisma/client";

export class InviteMemberDto {
  @IsString()
  userId!: string;

  @IsEnum(StorePosition)
  position!: StorePosition;
}
