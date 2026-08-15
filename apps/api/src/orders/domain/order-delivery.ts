import { createHash } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { NotificationType, OrderStatus, Prisma, QualityCheckResult, StorePosition, WarrantyStatus } from "@prisma/client";

export async function ensureBalanceTodos(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { amount: true, constructionRecord: { select: { qualityResult: true } } }
  });
  if (!order?.amount || order.amount.outstandingCents <= 0 || order.constructionRecord?.qualityResult !== QualityCheckResult.PASS) return;
  const financeMembers = await tx.storeMember.findMany({
    where: { storeId: order.storeId, position: StorePosition.FINANCE },
    select: { userId: true }
  });
  const recipients = [...new Set([order.salesPersonId, ...financeMembers.map((member) => member.userId)])];
  await tx.notification.createMany({
    data: recipients.map((userId) => ({
      userId,
      type: NotificationType.ORDER_BALANCE_DUE,
      todoKey: `${userId}:${order.id}:ORDER_BALANCE_DUE:PENDING_BALANCE`,
      payload: {
        orderId: order.id,
        orderNo: order.orderNo,
        storeId: order.storeId,
        outstandingCents: order.amount!.outstandingCents,
        stage: "PENDING_BALANCE"
      }
    })),
    skipDuplicates: true
  });
}

export type FinalizeDeliveryResult = {
  orderId: string;
  warrantyId: string;
  status: "COMPLETED" | "IDEMPOTENT";
};

export async function finalizeOrderDelivery(
  tx: Prisma.TransactionClient,
  orderId: string,
  actorId: string,
  expectedVersion?: number
): Promise<FinalizeDeliveryResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      amount: true,
      items: { include: { product: true } },
      constructionRecord: { include: { photos: true } },
      warranty: true
    }
  });
  if (!order) throw new NotFoundException("订单不存在");
  if (!order.amount) throw new BadRequestException("订单缺少金额事实，不能最终交付");
  if (order.status === OrderStatus.CANCELLED) throw new BadRequestException("已取消订单不能最终交付");
  if (order.constructionRecord?.qualityResult !== QualityCheckResult.PASS) {
    throw new BadRequestException("质检未通过，不能最终交付");
  }
  if (order.amount.outstandingCents > 0) {
    throw new BadRequestException("订单仍有未收款余额，不能最终交付");
  }

  if ((order.status === OrderStatus.COMPLETED || order.status === OrderStatus.WARRANTIED) && order.warranty?.status === WarrantyStatus.ACTIVE) {
    await tx.notification.updateMany({
      where: { type: NotificationType.ORDER_BALANCE_DUE, todoKey: { contains: ":" + order.id + ":" }, handledAt: null },
      data: { handledAt: new Date() }
    });
    return { orderId: order.id, warrantyId: order.warranty.id, status: "IDEMPOTENT" };
  }

  if (order.warranty && order.warranty.status !== WarrantyStatus.PENDING_ACTIVATION) {
    throw new BadRequestException("现有质保状态不允许最终交付");
  }

  const deliveryDate = new Date();
  const startDate = new Date(Date.UTC(deliveryDate.getUTCFullYear(), deliveryDate.getUTCMonth(), deliveryDate.getUTCDate()));
  const warrantyYears = Math.max(1, ...order.items.map((item) => item.product.warrantyYears ?? 1));
  const endDate = new Date(startDate);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + warrantyYears);
  // Claim the order state before touching the unique warranty fact. This makes
  // concurrent final-delivery commands serialize on the lifecycle version and
  // avoids a second writer failing on Warranty.orderId after doing partial work.
  const updated = await tx.order.updateMany({
    where: {
      id: order.id,
      ...(expectedVersion === undefined ? {} : { lifecycleVersion: expectedVersion }),
      status: { notIn: [OrderStatus.COMPLETED, OrderStatus.WARRANTIED, OrderStatus.CANCELLED] }
    },
    data: { status: OrderStatus.COMPLETED, lifecycleVersion: { increment: 1 } }
  });
  if (updated.count !== 1) {
    const current = await tx.order.findUnique({ where: { id: order.id }, include: { warranty: true } });
    if (current?.status === OrderStatus.COMPLETED && current.warranty?.status === WarrantyStatus.ACTIVE) {
      return { orderId: order.id, warrantyId: current.warranty.id, status: "IDEMPOTENT" };
    }
    throw new BadRequestException("订单状态已被其他操作改变，请刷新后重试");
  }
  let warranty = order.warranty;
  if (!warranty) {
    warranty = await tx.warranty.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        customerId: order.customerId,
        vehicleId: order.vehicleId,
        warrantyNo: buildOrderWarrantyNo(order.id),
        status: WarrantyStatus.ACTIVE,
        scope: "订单施工质保",
        startDate,
        endDate,
        createdById: actorId,
        photos: {
          create: (order.constructionRecord?.photos ?? []).map((photo) => ({ constructionPhotoId: photo.id, url: photo.url }))
        }
      }
    });
  } else if (warranty.status === WarrantyStatus.PENDING_ACTIVATION) {
    warranty = await tx.warranty.update({
      where: { id: warranty.id },
      data: { status: WarrantyStatus.ACTIVE, startDate, endDate }
    });
  }
  await tx.auditEvent.create({
    data: {
      action: "ORDER_FINAL_DELIVERY",
      actorId,
      storeId: order.storeId,
      targetType: "order",
      targetId: order.id,
      metadata: { orderId: order.id, warrantyId: warranty.id, deliveredAt: deliveryDate.toISOString() }
    }
  });
  await tx.notification.updateMany({
    where: { type: NotificationType.ORDER_BALANCE_DUE, todoKey: { contains: `:${order.id}:` }, handledAt: null },
    data: { handledAt: deliveryDate }
  });
  return { orderId: order.id, warrantyId: warranty.id, status: "COMPLETED" };
}

function buildOrderWarrantyNo(orderId: string) {
  const suffix = createHash("sha1").update(`${orderId}:${Date.now()}`).digest("hex").slice(0, 10).toUpperCase();
  return `WAR${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${suffix}`;
}
