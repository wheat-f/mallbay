import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, HttpException } from "@nestjs/common";

export type OrderLifecycleCommandContext = {
  commandId: string;
  expectedVersion?: number;
  source: "WEB" | "CONSTRUCTION_WEB" | "MINI" | "QUOTE_CONVERSION" | "COMPATIBILITY_ADAPTER";
};

export type OrderLifecycleTransitionContext = {
  commandId?: string;
  expectedVersion?: string | number;
  source: OrderLifecycleCommandContext["source"];
};

export function requireCommandId(value: string | undefined) {
  const commandId = value?.trim();
  if (!commandId) {
    throw new BadRequestException({
      code: "COMMAND_ID_REQUIRED",
      message: "缺少稳定的履约命令标识，请升级调用端后重试"
    });
  }
  if (commandId.length > 128) {
    throw new BadRequestException({ code: "COMMAND_ID_INVALID", message: "履约命令标识过长" });
  }
  return commandId;
}

export function requireExpectedVersion(value: string | number | undefined) {
  const version = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new BadRequestException({
      code: "LIFECYCLE_VERSION_REQUIRED",
      message: "缺少有效的履约版本，请刷新页面后重试"
    });
  }
  return version;
}

export function fingerprintCommand(type: string, target: string, input: unknown) {
  return createHash("sha256")
    .update(stableStringify({ type, target, input }))
    .digest("hex");
}

export function assertCommandBinding(
  existing: {
    actorId: string;
    commandType: string;
    targetType: string;
    targetId: string;
    requestFingerprint: string;
  },
  expected: {
    actorId: string;
    commandType: string;
    targetType: string;
    targetId: string;
    requestFingerprint: string;
  }
) {
  if (
    existing.actorId !== expected.actorId ||
    existing.commandType !== expected.commandType ||
    existing.targetType !== expected.targetType ||
    existing.targetId !== expected.targetId ||
    existing.requestFingerprint !== expected.requestFingerprint
  ) {
    throw new ConflictException({
      code: "COMMAND_ID_CONFLICT",
      message: "该命令标识已绑定其他操作者、对象或业务输入"
    });
  }
}

export function replayStoredRejection(summary: unknown): never {
  const value = isRecord(summary) ? summary : {};
  const status = typeof value.httpStatus === "number" ? value.httpStatus : 400;
  throw new HttpException({
    code: typeof value.code === "string" ? value.code : "COMMAND_PRECONDITION_FAILED",
    message: typeof value.message === "string" ? value.message : "履约命令未通过业务校验",
    replayed: true
  }, status);
}

export function toJsonValue(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as object;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
