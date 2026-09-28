import { BadRequestException } from "@nestjs/common";

/** An HTTP mutation must carry the browser's stable request identifier across retries. */
export function requireBindingCommandId(value: string | undefined): string {
  const commandId = value?.trim();
  if (!commandId || commandId.length > 128) {
    throw new BadRequestException("门店绑定变更请求需要有效的 X-Request-Id");
  }
  return commandId;
}
