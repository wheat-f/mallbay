import { createHash } from "node:crypto";
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

export async function finalizeOrderDelivery(tx: Prisma.TransactionClient, orderId: string, actorId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: {
      amount: true,
      items: { include: { product: true } },
      constructionRecord: { include: { photos: true } },
      warranty: true
    }
  });
  if (!order?.amount) return;
  if (order.constructionRecord?.qualityResult !== QualityCheckResult.PASS || order.amount.outstandingCents > 0) return;

  if ((order.status === OrderStatus.COMPLETED || order.status === OrderStatus.WARRANTIED) && order.warranty?.status === WarrantyStatus.ACTIVE) {
    await tx.notification.updateMany({
      where: { type: NotificationType.ORDER_BALANCE_DUE, todoKey: { contains: ":" + order.id + ":" }, handledAt: null },
      data: { handledAt: new Date() }
    });
    return;
  }

  const deliveryDate = new Date();
  const startDate = new Date(Date.UTC(deliveryDate.getUTCFullYear(), deliveryDate.getUTCMonth(), deliveryDate.getUTCDate()));
  const warrantyYears = Math.max(1, ...order.items.map((item) => item.product.warrantyYears ?? 1));
  const endDate = new Date(startDate);
  endDate.setUTCFullYear(endDate.getUTCFullYear() + warrantyYears);
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
  await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.COMPLETED } });
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
}

function buildOrderWarrantyNo(orderId: string) {
  const suffix = createHash("sha1").update(`${orderId}:${Date.now()}`).digest("hex").slice(0, 10).toUpperCase();
  return `WAR${new Date().toISOString().slice(0, 10).replace(/-/g, "")}${suffix}`;
}
