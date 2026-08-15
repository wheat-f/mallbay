import { IsIn, IsOptional, IsString, MaxLength } from "class-validator";

export const ORDER_LIFECYCLE_CLIENT_EVENTS = [
  "RESULT_UNKNOWN",
  "ORIGINAL_COMMAND_RETRY_RECOVERED",
  "VIEW_LATEST_VERSION",
  "CREATE_NEW_INTENT"
] as const;

export const ORDER_LIFECYCLE_CLIENT_SURFACES = [
  "ORDER_CREATE",
  "ORDER_LIST",
  "CONSTRUCTION_OFFLINE"
] as const;

export const ORDER_LIFECYCLE_CLIENT_COMMANDS = [
  "CREATE_ORDER",
  "DISPATCH",
  "START_CONSTRUCTION",
  "COMPLETE_CONSTRUCTION",
  "QUALITY_CHECK",
  "FINAL_DELIVERY",
  "CANCEL",
  "RETURN_TO_PENDING",
  "OFFLINE_SYNC"
] as const;

export type OrderLifecycleClientEvent = (typeof ORDER_LIFECYCLE_CLIENT_EVENTS)[number];
export type OrderLifecycleClientSurface = (typeof ORDER_LIFECYCLE_CLIENT_SURFACES)[number];

export class OrderLifecycleClientEventDto {
  @IsIn(ORDER_LIFECYCLE_CLIENT_EVENTS)
  event!: OrderLifecycleClientEvent;

  @IsIn(ORDER_LIFECYCLE_CLIENT_SURFACES)
  surface!: OrderLifecycleClientSurface;

  @IsOptional()
  @IsIn(ORDER_LIFECYCLE_CLIENT_COMMANDS)
  commandType?: (typeof ORDER_LIFECYCLE_CLIENT_COMMANDS)[number];

  @IsOptional()
  @IsIn(["WEB"])
  @IsString()
  @MaxLength(40)
  source?: "WEB";
}
