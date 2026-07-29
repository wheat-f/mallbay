import { IsEnum, IsInt, IsISO8601, IsNotEmpty, IsObject, IsOptional, IsString, Min, MaxLength } from "class-validator";
import { SettingsConfigDomain } from "@prisma/client";
export class CreateConfigVersionDto { @IsEnum(SettingsConfigDomain) domain!: SettingsConfigDomain; @IsString() @IsNotEmpty() capabilityCode!: string; @IsString() @IsNotEmpty() scopeId!: string; @IsObject() payload!: Record<string, unknown>; @IsOptional() @IsISO8601() effectiveAt?: string; @IsOptional() @IsISO8601() expiresAt?: string; @IsOptional() @IsString() requestId?: string; }
export class UpdateConfigVersionDto { @IsObject() payload!: Record<string, unknown>; @IsOptional() @IsInt() @Min(1) expectedVersion?: number; @IsOptional() @IsISO8601() effectiveAt?: string; @IsOptional() @IsISO8601() expiresAt?: string; @IsOptional() @IsString() requestId?: string; }
export class WithdrawConfigVersionDto { @IsString() @IsNotEmpty() @MaxLength(240) reason!: string; }
