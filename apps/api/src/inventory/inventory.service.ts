/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import {
  InventoryMovementType,
  ProductUnit,
  PurchaseRequirementStatus,
  PurchaseOrderStatus
} from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ConvertBatchUnitDto,
  CreateOrderInventoryAllocationsDto,
  CreatePurchaseRequirementDto,
  CreateInventoryBatchDto,
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreateSupplierContactDto,
  CreateSupplierRatingHistoryDto,
  CreateSupplierDto,
  ListInventoryDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  UpdateSupplierDto
} from "./dto/inventory.dto";

export type AuthenticatedInventoryUser = UserWithStoreMember & {
  username?: string;
};

type CreatePurchaseOrderFromRequirementInput = {
  supplierName?: string;
  expectedAt?: string;
};

type SplitBatchInput = {
  quantityMeters: number;
};

type StockOperationInput = {
  batchId: string;
  movementType: InventoryMovementType;
  quantity: number;
  note?: string;
};

type ReceivePurchaseItemBatchesResult = {
  received: Array<{ index: number; batchNo: string; batchId?: string }>;
  failed: Array<{ index: number; batchNo?: string; message: string }>;
};

type SupplierSummary = {
  id?: string;
  storeId?: string;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  rating?: number | null;
  note?: string | null;
  isActive?: boolean;
  contacts?: Array<{
    id: string;
    name: string;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
    isActive?: boolean;
  }>;
  ratingHistory?: Array<{
    id: string;
    rating: number;
    note?: string | null;
    createdAt?: Date | null;
    createdById?: string | null;
  }>;
  purchaseOrderCount: number;
  batchCount: number;
  lastPurchaseOrderAt?: Date | null;
  lastBatchUpdatedAt?: Date | null;
  lastMasterDataUpdatedAt?: Date | null;
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
      orderBy: { updatedAt: "desc" },
      include: { product: true }
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
      where: {
        storeId: query.storeId,
        productId: query.productId,
        batchId: query.batchId,
        orderId: query.orderId,
        movementType: query.movementType,
        createdById: query.createdById
      },
      orderBy: { createdAt: "desc" }
    });
  }

  async listSuppliers(user: AuthenticatedInventoryUser, storeId: string): Promise<SupplierSummary[]> {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }

    const [masterSuppliers, purchaseOrders, batches] = await Promise.all([
      this.prisma.supplier.findMany({
        where: { storeId },
        orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
        include: {
          contacts: { where: { isActive: true }, orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }] },
          ratingHistory: { orderBy: { createdAt: "desc" }, take: 5 }
        }
      }),
      this.prisma.purchaseOrder.findMany({
        where: { storeId, supplierName: { not: null } },
        select: { supplierName: true, updatedAt: true },
        orderBy: { updatedAt: "desc" }
      }),
      this.prisma.inventoryBatch.findMany({
        where: { storeId, supplierName: { not: null } },
        select: { supplierName: true, updatedAt: true },
        orderBy: { updatedAt: "desc" }
      })
    ]);

    const suppliers = new Map<string, SupplierSummary>();
    for (const supplier of masterSuppliers) {
      suppliers.set(supplier.name, {
        id: supplier.id,
        storeId: supplier.storeId,
        name: supplier.name,
        contactName: supplier.contactName,
        contactPhone: supplier.contactPhone,
        rating: supplier.rating,
        note: supplier.note,
        isActive: supplier.isActive,
        contacts: supplier.contacts,
        ratingHistory: supplier.ratingHistory,
        purchaseOrderCount: 0,
        batchCount: 0,
        lastMasterDataUpdatedAt: supplier.updatedAt
      });
    }

    for (const order of purchaseOrders) {
      const name = normalizeRequiredText(order.supplierName, "供应商名称");
      const supplier = suppliers.get(name) ?? createSnapshotSupplierSummary(name);
      supplier.purchaseOrderCount += 1;
      supplier.lastPurchaseOrderAt = newerDate(supplier.lastPurchaseOrderAt, order.updatedAt);
      suppliers.set(name, supplier);
    }

    for (const batch of batches) {
      const name = normalizeRequiredText(batch.supplierName, "供应商名称");
      const supplier = suppliers.get(name) ?? createSnapshotSupplierSummary(name);
      supplier.batchCount += 1;
      supplier.lastBatchUpdatedAt = newerDate(supplier.lastBatchUpdatedAt, batch.updatedAt);
      suppliers.set(name, supplier);
    }

    return Array.from(suppliers.values());
  }

  async createSupplier(user: AuthenticatedInventoryUser, dto: CreateSupplierDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.supplier.create({
      data: {
        storeId: dto.storeId,
        name: normalizeRequiredText(dto.name, "供应商名称"),
        contactName: normalizeOptionalText(dto.contactName),
        contactPhone: normalizeOptionalText(dto.contactPhone),
        rating: dto.rating,
        note: normalizeOptionalText(dto.note),
        createdById: actor.id
      }
    });
  }

  async updateSupplier(user: AuthenticatedInventoryUser, supplierId: string, dto: UpdateSupplierDto) {
    const actor = await this.withStoreMember(user);
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, storeId: true }
    });
    if (!supplier) throw new NotFoundException("供应商不存在");
    if (!PermissionPolicy.canManageInventory(actor, supplier.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(dto.name !== undefined ? { name: normalizeRequiredText(dto.name, "供应商名称") } : {}),
        ...(dto.contactName !== undefined ? { contactName: normalizeOptionalText(dto.contactName) } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: normalizeOptionalText(dto.contactPhone) } : {}),
        ...(dto.rating !== undefined ? { rating: dto.rating } : {}),
        ...(dto.note !== undefined ? { note: normalizeOptionalText(dto.note) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      }
    });
  }

  async createSupplierContact(
    user: AuthenticatedInventoryUser,
    supplierId: string,
    dto: CreateSupplierContactDto
  ) {
    const actor = await this.withStoreMember(user);
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, storeId: true }
    });
    if (!supplier) throw new NotFoundException("供应商不存在");
    if (!PermissionPolicy.canManageInventory(actor, supplier.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.supplierContact.create({
      data: {
        supplierId,
        name: normalizeRequiredText(dto.name, "联系人"),
        phone: normalizeOptionalText(dto.phone),
        role: normalizeOptionalText(dto.role),
        isPrimary: dto.isPrimary ?? false,
        createdById: actor.id
      }
    });
  }

  async createSupplierRatingHistory(
    user: AuthenticatedInventoryUser,
    supplierId: string,
    dto: CreateSupplierRatingHistoryDto
  ) {
    const actor = await this.withStoreMember(user);
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
      select: { id: true, storeId: true }
    });
    if (!supplier) throw new NotFoundException("供应商不存在");
    if (!PermissionPolicy.canManageInventory(actor, supplier.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const rating = await this.prisma.supplierRatingHistory.create({
      data: {
        supplierId,
        rating: dto.rating,
        note: normalizeOptionalText(dto.note),
        createdById: actor.id
      }
    });
    await this.prisma.supplier.update({
      where: { id: supplierId },
      data: { rating: dto.rating }
    });
    return rating;
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

  async approvePurchaseOrder(user: AuthenticatedInventoryUser, purchaseOrderId: string) {
    const actor = await this.withStoreMember(user);
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!purchaseOrder) throw new NotFoundException("采购订单不存在");
    if (!PermissionPolicy.canManageInventory(actor, purchaseOrder.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException("只有草稿采购订单可以审批");
    }
    return this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: PurchaseOrderStatus.ORDERED }
    });
  }

  async cancelPurchaseOrder(user: AuthenticatedInventoryUser, purchaseOrderId: string, dto: CancelPurchaseOrderDto) {
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("取消原因不能为空");
    }
    const actor = await this.withStoreMember(user);
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!purchaseOrder) throw new NotFoundException("采购订单不存在");
    if (!PermissionPolicy.canManageInventory(actor, purchaseOrder.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT && purchaseOrder.status !== PurchaseOrderStatus.ORDERED) {
      throw new BadRequestException("当前采购订单状态不允许取消");
    }
    const result = await this.prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: PurchaseOrderStatus.CANCELLED }
    });
    await this.prisma.auditEvent.create({
      data: {
        action: "PURCHASE_ORDER_CANCELLED",
        actorId: actor.id,
        storeId: purchaseOrder.storeId,
        targetType: "PurchaseOrder",
        targetId: purchaseOrderId,
        metadata: {
          orderNo: purchaseOrder.orderNo,
          previousStatus: purchaseOrder.status,
          nextStatus: PurchaseOrderStatus.CANCELLED,
          reason
        }
      }
    });
    return result;
  }

  async listPurchaseOrders(user: AuthenticatedInventoryUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: { items: { include: { product: true } } }
    });
    const itemIds = purchaseOrders.flatMap((order) => order.items.map((item) => item.id));
    if (itemIds.length === 0) {
      return purchaseOrders;
    }

    const receivedMovements = await this.prisma.inventoryMovement.findMany({
      where: {
        storeId,
        movementType: InventoryMovementType.PURCHASE_IN,
        sourceType: "PURCHASE_ORDER_ITEM",
        sourceId: { in: itemIds }
      },
      include: { batch: true },
      orderBy: { createdAt: "desc" }
    });
    const receivedBatchesByItem = new Map<string, Array<{
      batchId: string;
      batchNo: string;
      quantity: unknown;
      receivedAt: Date;
    }>>();
    for (const movement of receivedMovements) {
      if (!movement.sourceId || !movement.batch) continue;
      const rows = receivedBatchesByItem.get(movement.sourceId) ?? [];
      rows.push({
        batchId: movement.batch.id,
        batchNo: movement.batch.batchNo,
        quantity: movement.quantity,
        receivedAt: movement.batch.receivedAt ?? movement.createdAt
      });
      receivedBatchesByItem.set(movement.sourceId, rows);
    }

    return purchaseOrders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({
        ...item,
        receivedBatches: receivedBatchesByItem.get(item.id) ?? []
      }))
    }));
  }

  async listPurchaseRequirements(user: AuthenticatedInventoryUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.purchaseRequirement.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: {
        items: true,
        sourceOrder: {
          select: {
            id: true,
            orderNo: true,
            customer: { select: { name: true, companyName: true, contactPerson: true } },
            vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
            items: { include: { product: true } }
          }
        }
      }
    });
  }

  async createPurchaseRequirement(user: AuthenticatedInventoryUser, dto: CreatePurchaseRequirementDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canManageInventory(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (!dto.items?.length) {
      throw new BadRequestException("采购需求明细不能为空");
    }
    return this.prisma.purchaseRequirement.create({
      data: {
        storeId: dto.storeId,
        sourceOrderId: dto.sourceOrderId,
        createdById: actor.id,
        items: {
          create: dto.items.map((item) => ({
            productId: item.productId,
            orderItemId: item.orderItemId,
            requiredQuantity: item.requiredQuantity,
            requiredUnit: item.requiredUnit
          }))
        }
      },
      include: { items: true }
    });
  }

  async listPendingMatchOrders(user: AuthenticatedInventoryUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.order.findMany({
      where: { storeId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        vehicle: true,
        items: { include: { product: true, inventoryAllocations: true } }
      }
    });
  }

  async getOrderInventoryMatch(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: { include: { product: true, inventoryAllocations: { include: { batch: true } } } } }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canViewStoreData(actor, order.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const items = await Promise.all(order.items.map(async (item) => ({
      orderItem: item,
      availableBatches: await this.prisma.inventoryBatch.findMany({
        where: { storeId: order.storeId, productId: item.productId, availableQuantity: { gt: 0 } },
        orderBy: { receivedAt: "asc" }
      })
    })));
    return { order, items };
  }

  async createOrderInventoryAllocations(
    user: AuthenticatedInventoryUser,
    orderId: string,
    dto: CreateOrderInventoryAllocationsDto
  ) {
    const actor = await this.withStoreMember(user);
    if (!dto.allocations?.length) {
      throw new BadRequestException("锁库明细不能为空");
    }
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: { include: { product: true } } } });
      if (!order) throw new NotFoundException("订单不存在");
      if (!PermissionPolicy.canManageInventory(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }
      const locked: Array<{ batchId: string; orderItemId: string; quantity: number }> = [];
      for (const allocation of dto.allocations) {
        const orderItem = order.items.find((item) => item.id === allocation.orderItemId);
        if (!orderItem) throw new BadRequestException("订单明细不存在");
        const batch = await tx.inventoryBatch.findUnique({ where: { id: allocation.batchId } });
        if (!batch || batch.storeId !== order.storeId || batch.productId !== orderItem.productId) {
          throw new BadRequestException("库存批次与订单明细不匹配");
        }
        if (allocation.quantity > decimalToNumber(batch.availableQuantity)) {
          throw new BadRequestException("锁库数量超出可用库存");
        }
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            availableQuantity: { decrement: allocation.quantity },
            lockedQuantity: { increment: allocation.quantity }
          }
        });
        const row = await tx.orderInventoryAllocation.create({
          data: {
            storeId: order.storeId,
            orderId,
            orderItemId: orderItem.id,
            productId: orderItem.productId,
            batchId: batch.id,
            lockedQuantity: allocation.quantity,
            lockedById: actor.id
          }
        });
        await tx.inventoryMovement.create({
          data: {
            storeId: order.storeId,
            batchId: batch.id,
            productId: orderItem.productId,
            orderId,
            movementType: InventoryMovementType.ORDER_LOCK,
            quantity: allocation.quantity,
            unit: orderItem.product.unit,
            sourceType: "ORDER_INVENTORY_ALLOCATION",
            sourceId: row.id,
            createdById: actor.id,
            note: "订单库存锁定"
          }
        });
        locked.push({ batchId: batch.id, orderItemId: orderItem.id, quantity: allocation.quantity });
      }
      return { locked };
    });
  }

  async releaseOrderInventory(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("订单不存在");
      if (!PermissionPolicy.canManageInventory(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }
      const allocations = await tx.orderInventoryAllocation.findMany({ where: { orderId, status: "LOCKED" } });
      for (const allocation of allocations) {
        const quantity = decimalToNumber(allocation.lockedQuantity) - decimalToNumber(allocation.outboundQuantity);
        if (quantity <= 0) continue;
        await tx.inventoryBatch.update({
          where: { id: allocation.batchId },
          data: {
            availableQuantity: { increment: quantity },
            lockedQuantity: { decrement: quantity }
          }
        });
        await tx.orderInventoryAllocation.update({
          where: { id: allocation.id },
          data: { status: "RELEASED" }
        });
        await tx.inventoryMovement.create({
          data: {
            storeId: allocation.storeId,
            batchId: allocation.batchId,
            productId: allocation.productId,
            orderId,
            movementType: InventoryMovementType.STOCK_RELEASE,
            quantity,
            sourceType: "ORDER_INVENTORY_ALLOCATION",
            sourceId: allocation.id,
            createdById: actor.id,
            note: "订单库存释放"
          }
        });
      }
      return { released: allocations.length };
    });
  }

  async createPurchaseOrderFromRequirement(
    user: AuthenticatedInventoryUser,
    purchaseRequirementId: string,
    dto: CreatePurchaseOrderFromRequirementInput
  ) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const requirement = await tx.purchaseRequirement.findUnique({
        where: { id: purchaseRequirementId },
        include: { items: true }
      });
      if (!requirement) throw new NotFoundException("采购需求不存在");
      if (!PermissionPolicy.canManageInventory(actor, requirement.storeId)) {
        throw new ForbiddenException("无权限");
      }
      const openItems = requirement.items.filter((item) =>
        decimalToNumber(item.requiredQuantity) > decimalToNumber(item.fulfilledQuantity)
      );
      if (openItems.length === 0) {
        throw new BadRequestException("采购需求已完成");
      }

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          storeId: requirement.storeId,
          purchaseRequirementId,
          orderNo: buildPurchaseOrderNo(),
          supplierName: dto.supplierName,
          status: PurchaseOrderStatus.ORDERED,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
          createdById: actor.id,
          items: {
            create: openItems.map((item) => ({
              purchaseRequirementItemId: item.id,
              productId: item.productId,
              quantity: decimalToNumber(item.requiredQuantity) - decimalToNumber(item.fulfilledQuantity)
            }))
          }
        },
        include: { items: true }
      });

      await tx.purchaseRequirement.update({
        where: { id: purchaseRequirementId },
        data: { status: PurchaseRequirementStatus.ORDERED }
      });
      return purchaseOrder;
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
      if (item.purchaseOrder.status === PurchaseOrderStatus.DRAFT) {
        throw new BadRequestException("采购订单审批通过后才能入库");
      }
      if (item.purchaseOrder.status === PurchaseOrderStatus.CANCELLED) {
        throw new BadRequestException("采购订单已取消，不能入库");
      }
      const receivedQuantity = decimalToNumber(item.receivedQuantity) + dto.quantity;
      if (receivedQuantity > decimalToNumber(item.quantity)) {
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
          receivedAt: new Date(),
          sourceType: "PURCHASE_ORDER_ITEM",
          sourceId: purchaseOrderItemId
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
          sourceType: "PURCHASE_ORDER_ITEM",
          sourceId: purchaseOrderItemId,
          createdById: actor.id,
          note: `采购单 ${item.purchaseOrder.orderNo} 入库`
        }
      });
      await tx.purchaseOrderItem.update({
        where: { id: purchaseOrderItemId },
        data: { receivedQuantity }
      });
      if (item.purchaseRequirementItemId) {
        await tx.purchaseRequirementItem.update({
          where: { id: item.purchaseRequirementItemId },
          data: { fulfilledQuantity: { increment: dto.quantity } }
        });
      }
      const allItems = await tx.purchaseOrderItem.findMany({ where: { purchaseOrderId: item.purchaseOrderId } });
      const status = allItems.every((row) =>
        row.id === purchaseOrderItemId
          ? receivedQuantity >= decimalToNumber(row.quantity)
          : decimalToNumber(row.receivedQuantity) >= decimalToNumber(row.quantity)
      )
        ? PurchaseOrderStatus.RECEIVED
        : PurchaseOrderStatus.PARTIAL_RECEIVED;
      await tx.purchaseOrder.update({ where: { id: item.purchaseOrderId }, data: { status } });
      if (item.purchaseRequirementItemId) {
        const requirementItems = await tx.purchaseRequirementItem.findMany({
          where: { purchaseRequirementId: item.purchaseOrder.purchaseRequirementId ?? undefined }
        });
        const requirementId = requirementItems[0]?.purchaseRequirementId;
        if (requirementId) {
          const requirementFulfilled = requirementItems.every((row) =>
            decimalToNumber(row.fulfilledQuantity) >= decimalToNumber(row.requiredQuantity)
          );
          await tx.purchaseRequirement.update({
            where: { id: requirementId },
            data: { status: requirementFulfilled ? PurchaseRequirementStatus.FULFILLED : PurchaseRequirementStatus.PARTIAL_RECEIVED }
          });
        }
      }
      return batch;
    });
  }

  async receivePurchaseItemBatches(
    user: AuthenticatedInventoryUser,
    purchaseOrderItemId: string,
    dto: ReceivePurchaseItemBatchesDto
  ): Promise<ReceivePurchaseItemBatchesResult> {
    if (!dto.batches?.length) {
      throw new BadRequestException("批量入库明细不能为空");
    }
    const result: ReceivePurchaseItemBatchesResult = { received: [], failed: [] };
    for (const [index, batch] of dto.batches.entries()) {
      try {
        const receivedBatch = await this.receivePurchaseItem(user, purchaseOrderItemId, batch);
        result.received.push({
          index,
          batchNo: batch.batchNo,
          batchId: (receivedBatch as { id?: string }).id
        });
      } catch (error) {
        result.failed.push({
          index,
          batchNo: batch.batchNo,
          message: error instanceof Error ? error.message : "入库失败"
        });
      }
    }
    return result;
  }

  async lockOrderInventory(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { items: { include: { product: true } } }
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (!PermissionPolicy.canManageInventory(actor, order.storeId)) {
        throw new ForbiddenException("无权限");
      }

      const locked: Array<{ batchId: string; productId: string; quantity: number }> = [];
      const missing: Array<{ productId: string; orderItemId: string; quantity: number; unit: ProductUnit }> = [];
      for (const item of order.items) {
        let remaining = item.quantity;
        const batches = await tx.inventoryBatch.findMany({
          where: { storeId: order.storeId, productId: item.productId, availableQuantity: { gt: 0 } },
          orderBy: { receivedAt: "asc" }
        });
        for (const batch of batches) {
          if (remaining <= 0) break;
          const quantity = Math.min(decimalToNumber(batch.availableQuantity), remaining);
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              availableQuantity: { decrement: quantity },
              lockedQuantity: { increment: quantity }
            }
          });
          await tx.orderInventoryAllocation.create({
            data: {
              storeId: order.storeId,
              orderId,
              orderItemId: item.id,
              productId: item.productId,
              batchId: batch.id,
              lockedQuantity: quantity,
              lockedById: actor.id
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
              unit: item.product.unit,
              sourceType: "ORDER_INVENTORY_ALLOCATION",
              sourceId: orderId,
              createdById: actor.id,
              note: "订单库存锁定"
            }
          });
          locked.push({ batchId: batch.id, productId: item.productId, quantity });
          remaining -= quantity;
        }
        if (remaining > 0) {
          missing.push({ productId: item.productId, orderItemId: item.id, quantity: remaining, unit: item.product.unit });
        }
      }

      const purchaseRequirement = missing.length > 0
        ? await tx.purchaseRequirement.create({
          data: {
            storeId: order.storeId,
            sourceOrderId: orderId,
            createdById: actor.id,
            items: {
              create: missing.map((item) => ({
                productId: item.productId,
                orderItemId: item.orderItemId,
                requiredQuantity: item.quantity,
                requiredUnit: item.unit
              }))
            }
          },
          include: { items: true }
        })
        : undefined;

      return { locked, missing, purchaseRequirement };
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
      const allocations = await tx.orderInventoryAllocation.findMany({
        where: { orderId, status: "LOCKED" }
      });
      for (const allocation of allocations) {
        const quantity = decimalToNumber(allocation.lockedQuantity) - decimalToNumber(allocation.outboundQuantity);
        if (quantity <= 0) continue;
        await tx.inventoryBatch.update({
          where: { id: allocation.batchId },
          data: {
            lockedQuantity: { decrement: quantity },
            outboundQuantity: { increment: quantity }
          }
        });
        await tx.orderInventoryAllocation.update({
          where: { id: allocation.id },
          data: {
            outboundQuantity: { increment: quantity },
            status: "OUTBOUND",
            outboundById: actor.id,
            outboundAt: new Date()
          }
        });
        await tx.inventoryMovement.create({
          data: {
            storeId: allocation.storeId,
            batchId: allocation.batchId,
            productId: allocation.productId,
            orderId,
            movementType: InventoryMovementType.ORDER_OUT,
            quantity,
            sourceType: "ORDER_INVENTORY_ALLOCATION",
            sourceId: allocation.id,
            createdById: actor.id,
            note: "订单施工出库"
          }
        });
      }
      return { outbound: allocations.length };
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

  async splitBatch(user: AuthenticatedInventoryUser, batchId: string, dto: SplitBatchInput) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({
        where: { id: batchId },
        include: { product: true }
      });
      if (!batch) throw new NotFoundException("库存批次不存在");
      if (!PermissionPolicy.canManageInventory(actor, batch.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (batch.unit !== ProductUnit.ROLL) {
        throw new BadRequestException("仅卷单位批次支持拆分");
      }
      const metersPerRoll = decimalToNumber(batch.product.metersPerRoll ?? 0);
      if (metersPerRoll <= 0) {
        throw new BadRequestException("产品未配置每卷米数");
      }
      const splitRollQuantity = Number((dto.quantityMeters / metersPerRoll).toFixed(batch.product.quantityPrecision ?? 3));
      if (splitRollQuantity <= 0 || splitRollQuantity > decimalToNumber(batch.availableQuantity)) {
        throw new BadRequestException("拆分数量超出可用库存");
      }
      const existingChildren = await tx.inventoryBatch.count({ where: { parentBatchId: batch.id } });
      const childBatchNo = `${batch.batchNo}-${String(existingChildren + 1).padStart(2, "0")}`;

      await tx.inventoryBatch.update({
        where: { id: batch.id },
        data: {
          totalQuantity: { decrement: splitRollQuantity },
          availableQuantity: { decrement: splitRollQuantity }
        }
      });
      const childBatch = await tx.inventoryBatch.create({
        data: {
          storeId: batch.storeId,
          productId: batch.productId,
          batchNo: childBatchNo,
          supplierName: batch.supplierName,
          unit: ProductUnit.METER,
          totalQuantity: dto.quantityMeters,
          availableQuantity: dto.quantityMeters,
          lockedQuantity: 0,
          outboundQuantity: 0,
          unitCostCents: batch.unitCostCents,
          productionDate: batch.productionDate,
          receivedAt: batch.receivedAt,
          parentBatchId: batch.id,
          sourceType: "BATCH_SPLIT",
          sourceId: batch.id
        }
      });
      await tx.inventoryMovement.create({
        data: {
          storeId: batch.storeId,
          batchId: childBatch.id,
          productId: batch.productId,
          movementType: InventoryMovementType.BATCH_SPLIT,
          quantity: dto.quantityMeters,
          unit: ProductUnit.METER,
          fromUnit: ProductUnit.ROLL,
          toUnit: ProductUnit.METER,
          conversionRate: metersPerRoll,
          sourceType: "INVENTORY_BATCH",
          sourceId: batch.id,
          createdById: actor.id,
          note: `批次 ${batch.batchNo} 拆分`
        }
      });
      return childBatch;
    });
  }

  async createStockOperation(user: AuthenticatedInventoryUser, dto: StockOperationInput) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.inventoryBatch.findUnique({ where: { id: dto.batchId } });
      if (!batch) throw new NotFoundException("库存批次不存在");
      if (!PermissionPolicy.canManageInventory(actor, batch.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (dto.quantity <= 0) {
        throw new BadRequestException("出入库数量必须大于 0");
      }

      const direction = stockOperationDirection(dto.movementType);
      if (direction === "IN") {
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            totalQuantity: { increment: dto.quantity },
            availableQuantity: { increment: dto.quantity }
          }
        });
      } else {
        if (dto.quantity > decimalToNumber(batch.availableQuantity)) {
          throw new BadRequestException("出库数量超出可用库存");
        }
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            availableQuantity: { decrement: dto.quantity },
            outboundQuantity: { increment: dto.quantity }
          }
        });
      }

      return tx.inventoryMovement.create({
        data: {
          storeId: batch.storeId,
          batchId: batch.id,
          productId: batch.productId,
          movementType: dto.movementType,
          quantity: dto.quantity,
          unit: batch.unit,
          sourceType: "STOCK_OPERATION",
          sourceId: batch.id,
          createdById: actor.id,
          note: dto.note
        }
      });
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

function decimalToNumber(value: number | { toNumber?: () => number; toString: () => string }) {
  if (typeof value === "number") return value;
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value.toString());
}

function normalizeRequiredText(value: string | null | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BadRequestException(`${label}不能为空`);
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function createSnapshotSupplierSummary(name: string): SupplierSummary {
  return {
    name,
    isActive: true,
    purchaseOrderCount: 0,
    batchCount: 0
  };
}

function newerDate(left: Date | null | undefined, right: Date | null | undefined) {
  if (!left) return right ?? null;
  if (!right) return left;
  return right > left ? right : left;
}

function stockOperationDirection(type: InventoryMovementType) {
  switch (type) {
    case InventoryMovementType.COUNT_IN:
    case InventoryMovementType.TRANSFER_IN:
    case InventoryMovementType.RETURN_IN:
      return "IN";
    case InventoryMovementType.COUNT_OUT:
    case InventoryMovementType.DAMAGE_OUT:
    case InventoryMovementType.TRANSFER_OUT:
    case InventoryMovementType.RETURN_OUT:
      return "OUT";
    default:
      throw new BadRequestException("不支持的手工出入库类型");
  }
}
