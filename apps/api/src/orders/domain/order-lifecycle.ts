import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { NotificationType, OrderStatus, Prisma } from "@prisma/client";
import { type UserWithStoreMember } from "../../permissions/domain/access-types";
import { AuditEventWriter } from "../../observability/audit-event-writer";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessContext } from "../../permissions/domain/access-context";
import { deriveOrderWorkflow, type OrderWorkflow } from "./order-workflow";
import { ensureBalanceTodos, finalizeOrderDelivery } from "./order-delivery";
import { CreateOrderUseCase } from "../use-cases/create-order.use-case";

export type OrderLifecycleCommand =
  | { type: "FINAL_DELIVERY" }
  | { type: "CANCEL"; reason: string }
  | { type: "RETURN_TO_PENDING_DISPATCH"; reason: string }
  | { type: "DISPATCH"; input: unknown }
  | { type: "START_CONSTRUCTION"; input: unknown }
  | { type: "COMPLETE_CONSTRUCTION"; input: unknown }
  | { type: "QUALITY_CHECK"; recordId: string; input: unknown };

export type ConstructionTransitionHandler = (
  user: UserWithStoreMember,
  orderId: string,
  command: OrderLifecycleCommand
) => Promise<unknown>;

/** Single seam for order workflow derivation and final-delivery writes. */
@Injectable()
export class OrderLifecycle {
  private constructionHandler?: ConstructionTransitionHandler;

  constructor(
    @Optional() private readonly createOrderUseCase?: CreateOrderUseCase,
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly auditWriter?: AuditEventWriter,
    @Optional() private readonly accessContext?: AccessContext
  ) {}

  createOrder(...args: Parameters<CreateOrderUseCase["execute"]>) {
    if (!this.createOrderUseCase) {
      throw new Error("OrderLifecycle createOrder implementation is not configured");
    }
    return this.createOrderUseCase.execute(...args);
  }

  getLifecycle(input: Parameters<typeof deriveOrderWorkflow>[0]): OrderWorkflow {
    return deriveOrderWorkflow(input);
  }

  getCapabilities(input: Parameters<typeof deriveOrderWorkflow>[0]) {
    return this.getLifecycle(input).capabilities;
  }

  listCapabilities(
    inputs: Array<{ id: string; workflow: Parameters<typeof deriveOrderWorkflow>[0] }>
  ) {
    return Object.fromEntries(
      inputs.map(({ id, workflow }) => [id, this.getCapabilities(workflow)])
    );
  }

  registerConstructionHandler(handler: ConstructionTransitionHandler) {
    this.constructionHandler = handler;
  }

  async transition(user: UserWithStoreMember, orderId: string, command: OrderLifecycleCommand) {
    if (["DISPATCH", "START_CONSTRUCTION", "COMPLETE_CONSTRUCTION", "QUALITY_CHECK"].includes(command.type)) {
      if (!this.constructionHandler) {
        throw new Error("OrderLifecycle construction transition implementation is not configured");
      }
      return this.constructionHandler(user, orderId, command);
    }
    if (!this.prisma) throw new Error("OrderLifecycle transition implementation is not configured");
    if (!this.accessContext) throw new Error("OrderLifecycle access context is not configured");
    const accessContext = this.accessContext;
    const reason = "reason" in command ? command.reason.trim() : "";
    if (command.type !== "FINAL_DELIVERY" && !reason) {
      throw new BadRequestException(command.type === "CANCEL" ? "取消订单必须填写原因" : "反审核退回必须填写原因");
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, storeId: true, salesPersonId: true, status: true }
      });
      if (!order) throw new NotFoundException("订单不存在");

      if (command.type === "FINAL_DELIVERY") {
        if (!await accessContext.can(user.id, "store", "write", { storeId: order.storeId })) {
          throw new ForbiddenException("仅归属门店店长或管理员可以最终交付");
        }
        return finalizeOrderDelivery(tx, orderId, user.id);
      }

      if (command.type === "CANCEL") {
        if (!await accessContext.can(user.id, "store", "write", { storeId: order.storeId })) {
          throw new ForbiddenException("无权限");
        }
        if (order.status === OrderStatus.CANCELLED) return { id: order.id, status: order.status };
        if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.WARRANTIED) {
          throw new BadRequestException("当前订单阶段不允许取消");
        }
        const updated = await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.CANCELLED },
          select: { id: true, status: true }
        });
        await tx.notification.updateMany({
          where: { type: NotificationType.ORDER_BALANCE_DUE, todoKey: { contains: ":" + order.id + ":" }, handledAt: null },
          data: { handledAt: new Date() }
        });
        await this.writeAudit(tx, {
          action: "ORDER_CANCELLED",
          actorId: user.id,
          targetType: "order",
          targetId: order.id,
          metadata: { storeId: order.storeId, orderId: order.id, reason, beforeStatus: order.status, afterStatus: OrderStatus.CANCELLED }
        });
        return updated;
      }

      const canManage = await accessContext.can(user.id, "orders", "write", {
        storeId: order.storeId,
        ownerId: order.salesPersonId
      });
      if (!canManage) throw new ForbiddenException("无权限");
      if (order.status === OrderStatus.CANCELLED) throw new BadRequestException("已取消订单不能退回修改");
      if (order.status === OrderStatus.PENDING_DISPATCH) return { id: order.id, status: order.status };
      const updated = await tx.order.update({
        where: { id: orderId },
        data: { status: OrderStatus.PENDING_DISPATCH },
        select: { id: true, status: true }
      });
      await this.writeAudit(tx, {
        action: "ORDER_RETURNED_TO_PENDING_DISPATCH",
        actorId: user.id,
        targetType: "order",
        targetId: order.id,
        metadata: { storeId: order.storeId, reason, beforeStatus: order.status, afterStatus: OrderStatus.PENDING_DISPATCH }
      });
      return updated;
    });
  }

  /** @deprecated Use getLifecycle to keep callers independent from derivation details. */
  derive(input: Parameters<typeof deriveOrderWorkflow>[0]): OrderWorkflow {
    return this.getLifecycle(input);
  }

  ensureBalanceTodos(tx: Prisma.TransactionClient, orderId: string) {
    return ensureBalanceTodos(tx, orderId);
  }

  finalizeDelivery(tx: Prisma.TransactionClient, orderId: string, actorId: string) {
    return finalizeOrderDelivery(tx, orderId, actorId);
  }

  private async writeAudit(tx: Prisma.TransactionClient, event: Parameters<AuditEventWriter["writeTransactional"]>[1]) {
    if (this.auditWriter) return this.auditWriter.writeTransactional(tx, event);
    return tx.auditEvent.create({
      data: {
        action: event.action,
        actorId: event.actorId,
        storeId: typeof event.metadata?.storeId === "string" ? event.metadata.storeId : undefined,
        targetType: event.targetType,
        targetId: event.targetId,
        metadata: (event.metadata ?? {}) as Prisma.InputJsonObject
      }
    });
  }
}
