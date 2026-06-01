/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InventoryMovementType,
  ProductUnit,
  PurchaseOrderStatus
} from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ConvertBatchUnitDto,
  CreateInventoryBatchDto,
  CreatePurchaseOrderDto,
  ListInventoryDto,
  ReceivePurchaseItemDto
} from "./dto/inventory.dto";

export type AuthenticatedInventoryUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async listBatches(user: AuthenticatedInventoryUser, query: ListInventoryDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.inventoryBatch.findMany({
      where: { storeId: query.storeId, productId: query.productId },
      orderBy: { updatedAt: "desc" }
    });
  }

  async createBatch(user: AuthenticatedInventoryUser, dto: CreateInventoryBatchDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const batch = await this.prisma.inventoryBatch.create({
      data: {
        storeId: dto.storeId,
        productId: dto.productId,
        batchNo: dto.batchNo,
        supplierName: dto.supplierName,
        totalQuantity: dto.totalQuantity,
        availableQuantity: dto.totalQuantity,
        lockedQuantity: 0,
        unitCostCents: dto.unitCostCents,
        productionDate: dto.productionDate ? new Date(dto.productionDate) : undefined,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date()
      }
    });
    await this.prisma.inventoryMovement.create({
      data: {
        storeId: dto.storeId,
        batchId: batch.id,
        productId: dto.productId,
        movementType: InventoryMovementType.PURCHASE_IN,
        quantity: dto.totalQuantity,
        createdById: actor.id,
        note: "批次入库"
      }
    });
    return batch;
  }

  async listMovements(user: AuthenticatedInventoryUser, query: ListInventoryDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.inventoryMovement.findMany({
      where: { storeId: query.storeId, productId: query.productId },
      orderBy: { createdAt: "desc" }
    });
  }

  async createPurchaseOrder(user: AuthenticatedInventoryUser, dto: CreatePurchaseOrderDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.purchaseOrder.create({
      data: {
        storeId: dto.storeId,
        orderNo: buildPurchaseOrderNo(),
        supplierName: dto.supplierName,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
        createdById: actor.id,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCostCents: item.unitCostCents
          }))
        }
      },
      include: { items: true }
    });
  }

  async listPurchaseOrders(user: AuthenticatedInventoryUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.purchaseOrder.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: { items: true }
    });
  }

  async receivePurchaseItem(
    user: AuthenticatedInventoryUser,
    purchaseOrderItemId: string,
    dto: ReceivePurchaseItemDto
  ) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.purchaseOrderItem.findUnique({
        where: { id: purchaseOrderItemId },
        include: { purchaseOrder: true }
      });
      if (!item) throw new NotFoundException("采购明细不存在");
      if (!PermissionPolicy.canManageInventory(actor, item.purchaseOrder.storeId)) {
        throw new ForbiddenException("无权限");
      }
      const receivedQuantity = item.receivedQuantity + dto.quantity;
      if (receivedQuantity > item.quantity) {
        throw new BadRequestException("入库数量不能超过采购数量");
      }
      const batch = await tx.inventoryBatch.upsert({
        where: {
          storeId_productId_batchNo: {
            storeId: item.purchaseOrder.storeId,
            productId: item.productId,
            batchNo: dto.batchNo
          }
        },
        create: {
          storeId: item.purchaseOrder.storeId,
          productId: item.productId,
          batchNo: dto.batchNo,
          supplierName: dto.supplierName ?? item.purchaseOrder.supplierName,
          totalQuantity: dto.quantity,
          availableQuantity: dto.quantity,
          unitCostCents: item.unitCostCents,
          receivedAt: new Date()
        },
        update: {
          totalQuantity: { increment: dto.quantity },
          availableQuantity: { increment: dto.quantity },
          receivedAt: new Date()
        }
      });
      await tx.inventoryMovement.create({
        data: {
          storeId: item.purchaseOrder.storeId,
          batchId: batch.id,
          productId: item.productId,
          movementType: InventoryMovementType.PURCHASE_IN,
          quantity: dto.quantity,
          createdById: actor.id,
          note: `采购单 ${item.purchaseOrder.orderNo} 入库`
        }
      });
      await tx.purchaseOrderItem.update({
        where: { id: purchaseOrderItemId },
        data: { receivedQuantity }
      });
      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: item.purchaseOrderId } });
      const status = allItems.every((row) =>
        row.id === purchaseOrderItemId ? receivedQuantity >= row.quantity : row.receivedQuantity >= row.quantity
      )
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIAL_RECEIVED;
      await tx.purchaseOrder.update({ where: { id: item.purchaseOrderId }, data: { status } });
      return batch;
    });
  }

  async lockOrderInventory(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: true }
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (!PermissionPolicy.canManageInventory(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }

      const locked: Array<{ batchId: string; productId: string; quantity: number }> = [];
      const missing: Array<{ productId: string; quantity: number }> = [];
      for (const item of order.items) {
        let remaining = item.quantity;
        const batches = await tx.inventoryBatch.findMany({
          where: { storeId: order.storeId, productId: item.productId, availableQuantity: { gt: 0 } },
          orderBy: { receivedAt: "asc" }
        });
        for (const batch of batches) {
          if (remaining <= 0) break;
          const quantity = Math.min(batch.availableQuantity, remaining);
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              availableQuantity: { decrement: quantity },
              lockedQuantity: { increment: quantity }
            }
          });
          await tx.inventoryMovement.create({
            data: {
              storeId: order.storeId,
              batchId: batch.id,
              productId: item.productId,
              orderId,
              movementType: InventoryMovementType.ORDER_LOCK,
              quantity,
              createdById: actor.id,
              note: "订单库存锁定"
            }
          });
          locked.push({ batchId: batch.id, productId: item.productId, quantity });
          remaining -= quantity;
        }
        if (remaining > 0) {
          missing.push({ productId: item.productId, quantity: remaining });
        }
      }

      const purchaseOrder = missing.length > 0
        ? await tx.purchaseOrder.create({
          data: {
            storeId: order.storeId,
            orderNo: buildPurchaseOrderNo(),
            status: PurchaseOrderStatus.DRAFT,
            supplierName: "待确认供应商",
            createdById: actor.id,
            items: { create: missing }
          },
          include: { items: true }
        })
        : undefined;

      return { locked, missing, purchaseOrder };
    });
  }

  async outboundOrderInventory(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("订单不存在");
      if (!PermissionPolicy.canManageInventory(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }
      const locks = await tx.inventoryMovement.findMany({
        where: { orderId, movementType: InventoryMovementType.ORDER_LOCK }
      });
      for (const lock of locks) {
        await tx.inventoryBatch.update({
          where: { id: lock.batchId },
          data: { lockedQuantity: { decrement: lock.quantity } }
        });
        await tx.inventoryMovement.create({
          data: {
            storeId: lock.storeId,
            batchId: lock.batchId,
            productId: lock.productId,
            orderId,
            movementType: InventoryMovementType.ORDER_OUT,
            quantity: lock.quantity,
            createdById: actor.id,
            note: "订单施工出库"
          }
        });
      }
      return { outbound: locks.length };
    });
  }

  async convertBatchUnit(user: AuthenticatedInventoryUser, batchId: string, dto: ConvertBatchUnitDto) {
    const actor = await this.withStoreMember(user);
    const batch = await this.prisma.inventoryBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException("库存批次不存在");
    if (!PermissionPolicy.canManageInventory(actor, batch.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (dto.fromUnit !== ProductUnit.ROLL || dto.toUnit !== ProductUnit.METER) {
      throw new BadRequestException("Phase 3 仅支持卷转米拆分记录");
    }
    await this.prisma.inventoryBatch.update({
      where: { id: batchId },
      data: {
        totalQuantity: { increment: dto.convertedQuantity - dto.quantity },
        availableQuantity: { increment: dto.convertedQuantity - dto.quantity }
      }
    });
    return this.prisma.inventoryMovement.create({
      data: {
        storeId: batch.storeId,
        batchId,
        productId: batch.productId,
        movementType: InventoryMovementType.UNIT_CONVERSION,
        quantity: dto.convertedQuantity,
        fromUnit: dto.fromUnit,
        toUnit: dto.toUnit,
        conversionRate: dto.convertedQuantity / dto.quantity,
        createdById: actor.id,
        note: "卷转米拆分"
      }
    });
  }

  private async withStoreMember(user: AuthenticatedInventoryUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) {
      return user;
    }
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }
}

function buildPurchaseOrderNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `PO${stamp}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
