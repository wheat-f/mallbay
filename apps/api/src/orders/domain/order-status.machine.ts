import { BadRequestException } from "@nestjs/common";
import type { OrderStatus } from "@prisma/client";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_DISPATCH: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["IN_CONSTRUCTION", "CANCELLED"],
  IN_CONSTRUCTION: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["WARRANTIED"],
  WARRANTIED: [],
  CANCELLED: []
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!transitions[from].includes(to)) {
    throw new BadRequestException(`订单状态不能从 ${from} 流转到 ${to}`);
  }
}
