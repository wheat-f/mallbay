/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import {
  ConstructionCostSettlementStatus,
  InventoryMovementType,
  ProductUnit,
  PurchaseRequirementStatus,
  PurchaseOrderStatus,
  StorePosition
} from "@prisma/client";
import type { Prisma } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ConvertBatchUnitDto,
  CreateOrderInventoryAllocationsDto,
  CreatePurchaseRequirementDto,
  CreateInventoryBatchDto,
  CreateWarehouseDto,
  CancelPurchaseOrderDto,
  CreatePurchaseOrderDto,
  CreateSupplierContactDto,
  CreateSupplierRatingHistoryDto,
  CreateSupplierDto,
  ListInventoryDto,
  ListPurchaseOrderExportDetailsDto,
  OutboundOrderInventoryDto,
  ReceivePurchaseItemBatchesDto,
  ReceivePurchaseItemDto,
  UpdatePurchaseReceiptCostDto,
  UpdateWarehouseDto,
  UpdateSupplierDto
} from "./dto/inventory.dto";
import { convertToBaseQuantity } from "./domain/unit-conversion";

export type AuthenticatedInventoryUser = UserWithStoreMember & {
  username?: string;
};

type CreatePurchaseOrderFromRequirementInput = {
  purchaserId?: string;
  supplierName?: string;
  expectedAt?: string;
  supplierAllocations?: Array<{
    supplierName: string;
    expectedAt?: string;
    items: Array<{
      purchaseRequirementItemId: string;
      quantity: number;
      unitCostCents?: number;
    }>;
  }>;
};

type CrossStoreRequirementItem = {
  sourceProductId?: string;
  executionProductId?: string;
  executionInventoryUnit?: ProductUnit;
  executionRequiredQuantity?: number;
};

function resolveCrossStoreRequirementItem(snapshot: unknown, sourceProductId: string) {
  if (!snapshot || typeof snapshot !== "object" || !("items" in snapshot)) return undefined;
  const items = (snapshot as { items?: unknown }).items;
  if (!Array.isArray(items)) return undefined;
  return items.find(
    (item): item is CrossStoreRequirementItem =>
      Boolean(item)
      && typeof item === "object"
      && (item as CrossStoreRequirementItem).sourceProductId === sourceProductId
  );
}

function resolveCrossStoreExecutionProductId(snapshot: unknown, sourceProductId: string) {
  return resolveCrossStoreRequirementItem(snapshot, sourceProductId)?.executionProductId ?? sourceProductId;
}

function resolveCrossStoreExecutionUnit(snapshot: unknown, sourceProductId: string, fallback: ProductUnit) {
  return resolveCrossStoreRequirementItem(snapshot, sourceProductId)?.executionInventoryUnit ?? fallback;
}

function resolveCrossStoreExecutionRequiredQuantity(snapshot: unknown, sourceProductId: string, fallback: number) {
  const value = resolveCrossStoreRequirementItem(snapshot, sourceProductId)?.executionRequiredQuantity;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}
type SplitBatchInput = {
  quantityMeters: number;
};

type StockOperationInput = {
  batchId: string;
  movementType: InventoryMovementType;
  quantity: number;
  note?: string;
  idempotencyKey?: string;
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
  settlementCycle?: string | null;
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

type WarehouseRecord = {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
};

type WarehouseLookupClient = {
  warehouse: {
    findUnique: (args: { where: { id: string } }) => Promise<WarehouseRecord | null>;
  };
};

@Injectable()
export class InventoryImplementation {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  private canAccess(actor: AuthenticatedInventoryUser, capability: string, action: string, storeId: string) {
    return this.accessContext.can({ userId: actor.id }, capability, action, { storeId });
  }

  async listBatches(user: AuthenticatedInventoryUser, query: ListInventoryDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "inventory", "read", query.storeId)) {
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
    if (!await this.canAccess(actor, "inventory", "write", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const warehouse = await this.resolveReceivingWarehouse(this.prisma, dto.storeId, dto.warehouseId, dto.warehouseName);
    const packageUnit = dto.unit ?? ProductUnit.PIECE;
    const baseUnit = dto.baseUnit ?? packageUnit;
    const baseQuantityPerPackage = dto.baseQuantityPerPackage ?? 1;
    const baseTotalQuantity = convertToBaseQuantity({
      quantity: dto.totalQuantity,
      fromUnit: packageUnit,
      baseUnit,
      packageUnit,
      baseQuantityPerPackage
    });
    const batch = await this.prisma.inventoryBatch.create({
      data: {
        storeId: dto.storeId,
        productId: dto.productId,
        batchNo: dto.batchNo,
        supplierName: dto.supplierName,
        unit: baseUnit,
        packageUnit,
        packageQuantity: dto.totalQuantity,
        baseUnit,
        baseQuantityPerPackage,
        totalQuantity: baseTotalQuantity,
        availableQuantity: baseTotalQuantity,
        lockedQuantity: 0,
        unitCostCents: dto.unitCostCents,
        productionDate: dto.productionDate ? new Date(dto.productionDate) : undefined,
        receivedAt: dto.receivedAt ? new Date(dto.receivedAt) : new Date(),
        warehouseId: warehouse?.id,
        warehouseName: warehouse?.name ?? normalizeOptionalText(dto.warehouseName)
      }
    });
    await this.prisma.inventoryMovement.create({
      data: {
        storeId: dto.storeId,
        batchId: batch.id,
        productId: dto.productId,
        movementType: InventoryMovementType.PURCHASE_IN,
        quantity: baseTotalQuantity,
        unit: baseUnit,
        fromUnit: packageUnit,
        toUnit: baseUnit,
        conversionRate: baseQuantityPerPackage,
        warehouseId: warehouse?.id,
        warehouseName: warehouse?.name ?? normalizeOptionalText(dto.warehouseName),
        createdById: actor.id,
        note: "批次入库"
      }
    });
    return batch;
  }

  async listWarehouses(user: AuthenticatedInventoryUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "inventory", "read", storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.warehouse.findMany({
      where: { storeId },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }]
    });
  }

  async createWarehouse(user: AuthenticatedInventoryUser, dto: CreateWarehouseDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "inventory", "write", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.warehouse.create({
      data: {
        storeId: dto.storeId,
        name: normalizeRequiredText(dto.name, "仓库名称"),
        code: normalizeOptionalText(dto.code),
        area: normalizeOptionalText(dto.area),
        address: normalizeOptionalText(dto.address),
        isActive: dto.isActive ?? true,
        createdById: actor.id
      }
    });
  }

  async updateWarehouse(user: AuthenticatedInventoryUser, warehouseId: string, dto: UpdateWarehouseDto) {
    const actor = await this.withStoreMember(user);
    const warehouse = await this.prisma.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("仓库不存在");
    if (!await this.canAccess(actor, "inventory", "write", warehouse.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        ...(dto.name !== undefined ? { name: normalizeRequiredText(dto.name, "仓库名称") } : {}),
        ...(dto.code !== undefined ? { code: normalizeOptionalText(dto.code) } : {}),
        ...(dto.area !== undefined ? { area: normalizeOptionalText(dto.area) } : {}),
        ...(dto.address !== undefined ? { address: normalizeOptionalText(dto.address) } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {})
      }
    });
  }

  async listMovements(user: AuthenticatedInventoryUser, query: ListInventoryDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "inventory", "read", query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const movements = await this.prisma.inventoryMovement.findMany({
      where: {
        storeId: query.storeId,
        productId: query.productId,
        batchId: query.batchId,
        orderId: query.orderId,
        movementType: query.movementType,
        createdById: query.createdById,
        createdAt: buildDateRangeFilter(query.createdFrom, query.createdTo)
      },
      include: {
        product: true,
        batch: true,
        order: { select: { id: true, orderNo: true } },
        createdBy: { select: { id: true, username: true, nickname: true } }
      },
      orderBy: { createdAt: "desc" }
    });

    const sourceIds = [...new Set(movements.map((movement) => movement.sourceId).filter((id): id is string => Boolean(id)))];
    const [allocations, purchaseItems] = await Promise.all([
      sourceIds.length === 0
        ? Promise.resolve([])
        : this.prisma.orderInventoryAllocation.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, order: { select: { id: true, orderNo: true } } }
          }),
      sourceIds.length === 0
        ? Promise.resolve([])
        : this.prisma.purchaseOrderItem.findMany({
            where: { id: { in: sourceIds } },
            select: { id: true, purchaseOrder: { select: { id: true, orderNo: true } } }
          })
    ]);

    const allocationMap = new Map(allocations.map((allocation) => [allocation.id, allocation.order]));
    const purchaseItemMap = new Map(purchaseItems.map((item) => [item.id, item.purchaseOrder]));

    return movements.map((movement) => {
      const allocationOrder = movement.sourceId ? allocationMap.get(movement.sourceId) : undefined;
      const purchaseOrder = movement.sourceId ? purchaseItemMap.get(movement.sourceId) : undefined;
      const relatedDocument = movement.order
        ? { type: "ORDER", id: movement.order.id, number: movement.order.orderNo }
        : allocationOrder
          ? { type: "ORDER", id: allocationOrder.id, number: allocationOrder.orderNo }
          : purchaseOrder
            ? { type: "PURCHASE_ORDER", id: purchaseOrder.id, number: purchaseOrder.orderNo }
            : null;

      return {
        ...movement,
        relatedDocument,
        sourceOrderNo: relatedDocument?.number ?? null,
        sourceNo: relatedDocument?.number ?? movement.sourceId ?? null
      };
    });
  }

  async listSuppliers(user: AuthenticatedInventoryUser, storeId: string): Promise<SupplierSummary[]> {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "purchase", "read", storeId)) {
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
        settlementCycle: supplier.settlementCycle,
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
    if (!await this.canAccess(actor, "purchase", "write", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.supplier.create({
      data: {
        storeId: dto.storeId,
        name: normalizeRequiredText(dto.name, "供应商名称"),
        contactName: normalizeOptionalText(dto.contactName),
        contactPhone: normalizeOptionalText(dto.contactPhone),
        settlementCycle: normalizeOptionalText(dto.settlementCycle),
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
    if (!await this.canAccess(actor, "purchase", "write", supplier.storeId)) {
      throw new ForbiddenException("无权限");
    }

    return this.prisma.supplier.update({
      where: { id: supplierId },
      data: {
        ...(dto.name !== undefined ? { name: normalizeRequiredText(dto.name, "供应商名称") } : {}),
        ...(dto.contactName !== undefined ? { contactName: normalizeOptionalText(dto.contactName) } : {}),
        ...(dto.contactPhone !== undefined ? { contactPhone: normalizeOptionalText(dto.contactPhone) } : {}),
        ...(dto.settlementCycle !== undefined ? { settlementCycle: normalizeOptionalText(dto.settlementCycle) } : {}),
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
    if (!await this.canAccess(actor, "purchase", "write", supplier.storeId)) {
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
    if (!await this.canAccess(actor, "purchase", "write", supplier.storeId)) {
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
    if (!await this.canAccess(actor, "purchase", "write", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const purchaserId = await this.resolvePurchaseOrderPurchaser(actor, dto.storeId, dto.purchaserId);
    if (dto.supplierName) {
      await this.assertActiveSupplier(dto.storeId, dto.supplierName);
    }
    return this.prisma.purchaseOrder.create({
      data: {
        storeId: dto.storeId,
        orderNo: buildPurchaseOrderNo(),
        supplierName: dto.supplierName,
        expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
        createdById: actor.id,
        purchaserId,
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
    if (!await this.canAccess(actor, "purchase", "write", purchaseOrder.storeId)) {
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
    if (!await this.canAccess(actor, "purchase", "write", purchaseOrder.storeId)) {
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
    if (!await this.canAccess(actor, "purchase", "read", storeId)) {
      throw new ForbiddenException("无权限");
    }
    const purchaseOrders = await this.prisma.purchaseOrder.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: {
        purchaser: { select: { id: true, username: true, nickname: true } },
        items: { include: { product: true } }
      }
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

  async exportPurchaseOrderDetails(
    user: AuthenticatedInventoryUser,
    dto: ListPurchaseOrderExportDetailsDto
  ) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "purchase", "read", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const orders = await this.prisma.purchaseOrder.findMany({
      where: { storeId: dto.storeId },
      orderBy: { createdAt: "desc" },
      include: {
        purchaser: { select: { id: true, username: true, nickname: true } },
        items: {
          include: {
            product: true,
            receiptCostRecords: { orderBy: { createdAt: "desc" }, include: { inventoryBatch: { select: { batchNo: true } } } }
          }
        }
      }
    });
    const rows = orders.flatMap((order) => order.items.map((item) => {
      const quantity = decimalToNumber(item.quantity);
      const receivedQuantity = decimalToNumber(item.receivedQuantity);
      return {
        purchaseOrderId: order.id,
        orderNo: order.orderNo,
        supplierName: order.supplierName ?? "",
        purchaserName: order.purchaser?.nickname ?? order.purchaser?.username ?? "",
        status: order.status,
        expectedAt: order.expectedAt,
        createdAt: order.createdAt,
        productId: item.productId,
        productBrand: item.product.brand,
        productName: item.product.name,
        productModel: item.product.model,
        productSpecification: item.product.specification,
        inventoryUnit: item.product.inventoryUnit,
        quantity,
        receivedQuantity,
        pendingQuantity: Math.max(0, quantity - receivedQuantity),
        plannedUnitCostCents: item.unitCostCents,
        itemAmountCents: item.unitCostCents == null ? null : item.unitCostCents * quantity
      };
    }));

    return rows.sort((left, right) => {
      const dimension = dto.exportDimension ?? "supplier";
      const leftKey = dimension === "date"
        ? (left.expectedAt ?? left.createdAt).toISOString()
        : dimension === "product"
          ? `${left.productBrand}\u0000${left.productName}\u0000${left.productModel}`
          : left.supplierName;
      const rightKey = dimension === "date"
        ? (right.expectedAt ?? right.createdAt).toISOString()
        : dimension === "product"
          ? `${right.productBrand}\u0000${right.productName}\u0000${right.productModel}`
          : right.supplierName;
      return leftKey.localeCompare(rightKey, "zh-CN") || left.orderNo.localeCompare(right.orderNo, "zh-CN");
    });
  }

  async getPurchaseOverview(user: AuthenticatedInventoryUser, storeId: string) {
    const [requirements, orders, suppliers] = await Promise.all([
      this.listPurchaseRequirements(user, storeId),
      this.listPurchaseOrders(user, storeId),
      this.listSuppliers(user, storeId)
    ]);
    return {
      openRequirementCount: requirements.filter((row) => row.status !== PurchaseRequirementStatus.FULFILLED && row.status !== PurchaseRequirementStatus.CANCELLED).length,
      pendingApprovalCount: orders.filter((row) => row.status === PurchaseOrderStatus.DRAFT).length,
      pendingInboundCount: orders.filter((row) => row.status === PurchaseOrderStatus.ORDERED || row.status === PurchaseOrderStatus.PARTIAL_RECEIVED).length,
      supplierCount: suppliers.length,
      requirements,
      orders,
      suppliers
    };
  }

  async getPurchaseOrder(user: AuthenticatedInventoryUser, purchaseOrderId: string) {
    const actor = await this.withStoreMember(user);
    const purchaseOrder = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: {
        purchaser: { select: { id: true, username: true, nickname: true } },
        items: {
          include: {
            product: true,
            receiptCostRecords: { orderBy: { createdAt: "desc" }, include: { inventoryBatch: { select: { batchNo: true } } } }
          }
        }
      }
    });
    if (!purchaseOrder) throw new NotFoundException("采购订单不存在");
    if (!await this.canAccess(actor, "purchase", "read", purchaseOrder.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const itemIds = purchaseOrder.items.map((item) => item.id);
    if (itemIds.length === 0) return purchaseOrder;
    const receivedMovements = await this.prisma.inventoryMovement.findMany({
      where: {
        storeId: purchaseOrder.storeId,
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
    return {
      ...purchaseOrder,
      items: purchaseOrder.items.map((item) => ({
        ...item,
        receivedBatches: receivedBatchesByItem.get(item.id) ?? []
      }))
    };
  }

  async listPurchaseRequirements(user: AuthenticatedInventoryUser, storeId: string) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "purchase", "read", storeId)) {
      throw new ForbiddenException("无权限");
    }
    return this.prisma.purchaseRequirement.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: true } },
        sourceOrder: {
          select: {
            id: true,
            orderNo: true,
            customer: { select: { name: true, companyName: true, contactPerson: true } },
            vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
            items: { include: { product: true } }
          }
        },
        purchaseOrders: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            orderNo: true,
            supplierName: true,
            status: true,
            expectedAt: true,
            createdAt: true,
            items: {
              select: {
                purchaseRequirementItemId: true,
                productId: true,
                quantity: true,
                receivedQuantity: true
              }
            }
          }
        }
      }
    });
  }

  async createPurchaseRequirement(user: AuthenticatedInventoryUser, dto: CreatePurchaseRequirementDto) {
    const actor = await this.withStoreMember(user);
    if (!await this.canAccess(actor, "purchase", "write", dto.storeId)) {
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
    if (!await this.canAccess(actor, "inventory", "read", storeId)) {
      throw new ForbiddenException("无权限");
    }
    const orders = await this.prisma.order.findMany({
      where: { executionStoreId: storeId, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      include: {
        customer: true,
        vehicle: true,
        items: { include: { product: true, inventoryAllocations: { include: { batch: true } } } },
        crossStoreTask: true
      }
    });
    return orders.filter((order) => isPendingInventoryMatchOrder(order));
  }

  async getOrderInventoryMatch(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        customer: true,
        vehicle: true,
        items: { include: { product: true, inventoryAllocations: { include: { batch: true } } } },
        crossStoreTask: true
      }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!await this.canAccess(actor, "inventory", "read", (order.executionStoreId ?? order.storeId))) {
      throw new ForbiddenException("无权限");
    }
    const items = await Promise.all(order.items.map(async (item) => {
      const inventoryProductId = resolveCrossStoreExecutionProductId(order.crossStoreTask?.requirementsSnapshot, item.productId);
      return {
        orderItem: item,
        inventoryProductId,
        availableBatches: await this.prisma.inventoryBatch.findMany({
          where: { storeId: (order.executionStoreId ?? order.storeId), productId: inventoryProductId, availableQuantity: { gt: 0 } },
          orderBy: { receivedAt: "asc" }
        })
      };
    }));
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
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true, inventoryAllocations: { include: { batch: true } } } },
          crossStoreTask: true
        }
      });
      if (!order) throw new NotFoundException("订单不存在");
    if (!await this.canAccess(actor, "inventory", "write", (order.executionStoreId ?? order.storeId))) {
        throw new ForbiddenException("无权限");
      }
      const locked: Array<{ batchId: string; orderItemId: string; quantity: number }> = [];
      for (const allocation of dto.allocations) {
        if (!Number.isFinite(allocation.quantity) || allocation.quantity <= 0) {
          throw new BadRequestException("锁定数量必须大于 0");
        }
        const orderItem = order.items.find((item) => item.id === allocation.orderItemId);
        if (!orderItem) throw new BadRequestException("订单明细不存在");
        const inventoryProductId = resolveCrossStoreExecutionProductId(order.crossStoreTask?.requirementsSnapshot, orderItem.productId);
        const batch = await tx.inventoryBatch.findUnique({ where: { id: allocation.batchId } });
        if (!batch || batch.storeId !== (order.executionStoreId ?? order.storeId) || batch.productId !== inventoryProductId) {
          throw new BadRequestException("库存批次与订单明细不匹配");
        }
        const allocationUnit = allocation.unit ?? batch.unit;
        const lockBaseQuantity = this.convertInventoryQuantityOrReject({
          quantity: allocation.quantity,
          fromUnit: allocationUnit,
          baseUnit: batch.unit,
          packageUnit: batch.packageUnit,
          baseQuantityPerPackage: decimalToNumber(batch.baseQuantityPerPackage ?? 1),
          action: "锁库"
        });
        if (lockBaseQuantity > decimalToNumber(batch.availableQuantity)) {
          throw new BadRequestException("锁库数量超出可用库存");
        }
        const crossRequirement = resolveCrossStoreRequirementItem(
          order.crossStoreTask?.requirementsSnapshot,
          orderItem.productId
        );
        if (crossRequirement) {
          const requiredExecutionQuantity = resolveCrossStoreExecutionRequiredQuantity(
            order.crossStoreTask?.requirementsSnapshot,
            orderItem.productId,
            decimalToNumber(orderItem.requiredBaseQuantity ?? orderItem.quantity)
          );
          const executionUnit = resolveCrossStoreExecutionUnit(
            order.crossStoreTask?.requirementsSnapshot,
            orderItem.productId,
            batch.unit
          );
          if (batch.unit !== executionUnit) {
            throw new BadRequestException("库存批次单位与跨店映射的执行库存单位不一致");
          }
          const coveredExecutionQuantity = (orderItem.inventoryAllocations ?? []).reduce((sum, existing) => {
            const storedQuantity = existing.status === "RELEASED"
              ? decimalToNumber(existing.outboundQuantity)
              : decimalToNumber(existing.lockedQuantity);
            return sum + storedQuantity;
          }, 0);
          if (coveredExecutionQuantity + lockBaseQuantity > requiredExecutionQuantity + 0.0001) {
            throw new BadRequestException("锁库数量不能超过跨店订单冻结的执行数量");
          }
        } else {
          const orderBaseUnit = orderItem.baseUnit ?? orderItem.product.inventoryUnit ?? batch.unit;
          const lockOrderBaseQuantity = this.convertProductQuantityOrReject({
            quantity: allocation.quantity,
            fromUnit: allocationUnit,
            toUnit: orderBaseUnit,
            product: orderItem.product,
            packageUnit: batch.packageUnit,
            baseQuantityPerPackage: decimalToNumber(batch.baseQuantityPerPackage ?? 1),
            action: "锁库"
          });
          const requiredOrderBaseQuantity = decimalToNumber(orderItem.requiredBaseQuantity ?? orderItem.quantity);
          const coveredOrderBaseQuantity = (orderItem.inventoryAllocations ?? []).reduce((sum, existing) => {
            const storedQuantity = existing.status === "RELEASED"
              ? decimalToNumber(existing.outboundQuantity)
              : decimalToNumber(existing.lockedQuantity);
            return sum + this.convertProductQuantityOrReject({
              quantity: storedQuantity,
              fromUnit: existing.batch?.unit ?? orderBaseUnit,
              toUnit: orderBaseUnit,
              product: orderItem.product,
              packageUnit: existing.batch?.packageUnit,
              baseQuantityPerPackage: decimalToNumber(existing.batch?.baseQuantityPerPackage ?? 1),
              action: "锁库"
            });
          }, 0);
          if (coveredOrderBaseQuantity + lockOrderBaseQuantity > requiredOrderBaseQuantity + 0.0001) {
            throw new BadRequestException("锁库数量不能超过订单待锁数量");
          }
        }
        const existingAllocation = (orderItem.inventoryAllocations ?? []).find((existing) => existing.batchId === batch.id);
        await tx.inventoryBatch.update({
          where: { id: batch.id },
          data: {
            availableQuantity: { decrement: lockBaseQuantity },
            lockedQuantity: { increment: lockBaseQuantity }
          }
        });
        const row = existingAllocation
          ? await tx.orderInventoryAllocation.update({
            where: { id: existingAllocation.id },
            data: {
              lockedQuantity: existingAllocation.status === "RELEASED"
                ? decimalToNumber(existingAllocation.outboundQuantity) + lockBaseQuantity
                : { increment: lockBaseQuantity },
              status: "LOCKED",
              lockedById: actor.id,
              lockedAt: new Date(),
              outboundById: existingAllocation.status === "RELEASED" ? null : undefined,
              outboundAt: existingAllocation.status === "RELEASED" ? null : undefined
            }
          })
          : await tx.orderInventoryAllocation.create({
            data: {
              storeId: (order.executionStoreId ?? order.storeId),
              orderId,
              crossStoreTaskId: order.crossStoreTask?.id,
              orderItemId: orderItem.id,
              productId: inventoryProductId,
              batchId: batch.id,
              lockedQuantity: lockBaseQuantity,
              lockedById: actor.id
            }
          });
        await tx.inventoryMovement.create({
          data: {
            storeId: (order.executionStoreId ?? order.storeId),
            batchId: batch.id,
            productId: inventoryProductId,
            crossStoreTaskId: order.crossStoreTask?.id,
            orderId,
            movementType: InventoryMovementType.ORDER_LOCK,
            quantity: lockBaseQuantity,
            unit: batch.unit,
            fromUnit: allocationUnit,
            toUnit: batch.unit,
            conversionRate: decimalToNumber(batch.baseQuantityPerPackage ?? 1),
            sourceType: "ORDER_INVENTORY_ALLOCATION",
            sourceId: row.id,
            createdById: actor.id,
            note: "订单库存锁定"
          }
        });
        locked.push({ batchId: batch.id, orderItemId: orderItem.id, quantity: lockBaseQuantity });
      }
      if (locked.length) await this.invalidateOrderLifecycleWithin(tx, orderId, "INVENTORY_ALLOCATION", `ALLOCATE:${orderId}:${locked.map((item) => item.batchId).join(",")}`, { locked });
      return { locked };
    });
  }

  async releaseOrderInventory(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("订单不存在");
    if (!await this.canAccess(actor, "inventory", "write", (order.executionStoreId ?? order.storeId))) {
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
      if (allocations.length) await this.invalidateOrderLifecycleWithin(tx, orderId, "INVENTORY_RELEASE", `RELEASE:${orderId}`, { allocationIds: allocations.map((allocation) => allocation.id) });
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
        include: {
          items: {
            include: {
              purchaseOrderItems: {
                include: { purchaseOrder: true }
              }
            }
          }
        }
      });
      if (!requirement) throw new NotFoundException("采购需求不存在");
    if (!await this.canAccess(actor, "purchase", "write", requirement.storeId)) {
        throw new ForbiddenException("无权限");
      }
      const purchaserId = await this.resolvePurchaseOrderPurchaser(actor, requirement.storeId, dto.purchaserId);
      const openItems = requirement.items
        .map((item) => {
          const orderedQuantity = (item.purchaseOrderItems ?? [])
            .filter((orderItem) => orderItem.purchaseOrder.status !== PurchaseOrderStatus.CANCELLED)
            .reduce((sum, orderItem) => sum + decimalToNumber(orderItem.quantity), 0);
          return {
            ...item,
            remainingToOrder: decimalToNumber(item.requiredQuantity) - orderedQuantity
          };
        })
        .filter((item) => item.remainingToOrder > 0);
      if (openItems.length === 0) {
        throw new BadRequestException("采购需求已全部转采购单");
      }

      if (dto.supplierAllocations?.length) {
        const itemRemaining = new Map(openItems.map((item) => [item.id, item.remainingToOrder]));
        const allocatedByItem = new Map<string, number>();
        const normalizedAllocations = dto.supplierAllocations.map((allocation) => {
          const items = allocation.items
            .filter((item) => item.quantity > 0)
            .map((item) => {
              const remaining = itemRemaining.get(item.purchaseRequirementItemId);
              if (remaining === undefined) {
                throw new BadRequestException("采购需求明细不存在或已全部转采购单");
              }
              const nextAllocated = (allocatedByItem.get(item.purchaseRequirementItemId) ?? 0) + item.quantity;
              if (nextAllocated > remaining) {
                throw new BadRequestException("采购数量不能超过需求剩余数量");
              }
              allocatedByItem.set(item.purchaseRequirementItemId, nextAllocated);
              const requirementItem = openItems.find((openItem) => openItem.id === item.purchaseRequirementItemId);
              if (!requirementItem) {
                throw new BadRequestException("采购需求明细不存在或已全部转采购单");
              }
              return {
                purchaseRequirementItemId: requirementItem.id,
                productId: requirementItem.productId,
                quantity: item.quantity,
                unitCostCents: item.unitCostCents
              };
            });

          if (items.length === 0) {
            throw new BadRequestException("每个供应商至少需要填写一个采购数量");
          }
          return {
            supplierName: allocation.supplierName,
            expectedAt: allocation.expectedAt,
            items
          };
        });

        const purchaseOrders = [];
        for (const allocation of normalizedAllocations) {
          await this.assertActiveSupplier(requirement.storeId, allocation.supplierName, tx);
          const expectedAt = allocation.expectedAt ?? dto.expectedAt;
          const purchaseOrder = await tx.purchaseOrder.create({
            data: {
              storeId: requirement.storeId,
              purchaseRequirementId,
              orderNo: buildPurchaseOrderNo(),
              supplierName: allocation.supplierName,
              status: PurchaseOrderStatus.ORDERED,
              expectedAt: expectedAt ? new Date(expectedAt) : undefined,
              createdById: actor.id,
              purchaserId,
              items: {
                create: allocation.items
              }
            },
            include: { items: true }
          });
          purchaseOrders.push(purchaseOrder);
        }

        const isFullyOrdered = openItems.every((item) => {
          const allocated = allocatedByItem.get(item.id) ?? 0;
          return item.remainingToOrder - allocated <= 0;
        });
        await tx.purchaseRequirement.update({
          where: { id: purchaseRequirementId },
          data: { status: isFullyOrdered ? PurchaseRequirementStatus.ORDERED : PurchaseRequirementStatus.PARTIAL_ORDERED }
        });
        return { purchaseOrders };
      }

      if (!dto.supplierName) {
        throw new BadRequestException("请选择供应商");
      }
      await this.assertActiveSupplier(requirement.storeId, dto.supplierName, tx);

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          storeId: requirement.storeId,
          purchaseRequirementId,
          orderNo: buildPurchaseOrderNo(),
          supplierName: dto.supplierName,
          status: PurchaseOrderStatus.ORDERED,
          expectedAt: dto.expectedAt ? new Date(dto.expectedAt) : undefined,
          createdById: actor.id,
          purchaserId,
          items: {
            create: openItems.map((item) => ({
              purchaseRequirementItemId: item.id,
              productId: item.productId,
              quantity: item.remainingToOrder
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
        include: { purchaseOrder: true, product: true }
      });
      if (!item) throw new NotFoundException("采购明细不存在");
    if (!await this.canAccess(actor, "purchase", "write", item.purchaseOrder.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (dto.idempotencyKey) {
        const existingMovement = await tx.inventoryMovement.findFirst({
          where: {
            storeId: item.purchaseOrder.storeId,
            sourceType: "PURCHASE_ORDER_ITEM",
            sourceId: purchaseOrderItemId,
            idempotencyKey: dto.idempotencyKey
          }
        });
        if (existingMovement) return existingMovement;
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
      const warehouse = await this.resolveReceivingWarehouse(
        tx,
        item.purchaseOrder.storeId,
        dto.warehouseId,
        dto.warehouseName
      );
      const product = (item as {
        product?: {
          unit?: ProductUnit | null;
          inventoryUnit?: ProductUnit | null;
          metersPerRoll?: number | { toNumber?: () => number; toString: () => string } | null;
        };
      }).product;
      const packageUnit = dto.unit ?? product?.unit ?? ProductUnit.PIECE;
      const baseUnit = dto.baseUnit ?? product?.inventoryUnit ?? packageUnit;
      const baseQuantityPerPackage = dto.baseQuantityPerPackage ?? decimalToNumber(product?.metersPerRoll ?? 1);
      const baseReceivedQuantity = convertToBaseQuantity({
        quantity: dto.quantity,
        fromUnit: packageUnit,
        baseUnit,
        packageUnit,
        baseQuantityPerPackage
      });
      const actualUnitCostCents = dto.actualUnitCostCents === undefined ? item.unitCostCents : dto.actualUnitCostCents;
      const plannedUnitCostCents = item.unitCostCents;
      const differenceCents = actualUnitCostCents == null || plannedUnitCostCents == null
        ? null
        : actualUnitCostCents - plannedUnitCostCents;
      const differenceReason = normalizeOptionalText(dto.costDifferenceReason);
      if (differenceCents !== null && differenceCents !== 0 && !differenceReason) {
        throw new BadRequestException("实际入库价与采购单价不一致时，请填写成本差异原因");
      }
      const baseUnitCostCents = actualUnitCostCents == null
        ? null
        : Math.round((actualUnitCostCents * dto.quantity) / baseReceivedQuantity);
      const existingBatch = await tx.inventoryBatch.findUnique({
        where: {
          storeId_productId_batchNo: {
            storeId: item.purchaseOrder.storeId,
            productId: item.productId,
            batchNo: dto.batchNo
          }
        },
        select: { id: true, unitCostCents: true }
      });
      if (existingBatch?.unitCostCents != null && baseUnitCostCents != null && existingBatch.unitCostCents !== baseUnitCostCents) {
        throw new BadRequestException("同一批次只能保留一个实际入库成本；价格不同请使用新的批次号入库");
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
          unit: baseUnit,
          packageUnit,
          packageQuantity: dto.quantity,
          baseUnit,
          baseQuantityPerPackage,
          totalQuantity: baseReceivedQuantity,
          availableQuantity: baseReceivedQuantity,
          unitCostCents: baseUnitCostCents,
          receivedAt: new Date(),
          warehouseId: warehouse?.id,
          warehouseName: warehouse?.name ?? normalizeOptionalText(dto.warehouseName),
          sourceType: "PURCHASE_ORDER_ITEM",
          sourceId: purchaseOrderItemId
        },
        update: {
          totalQuantity: { increment: baseReceivedQuantity },
          availableQuantity: { increment: baseReceivedQuantity },
          packageQuantity: { increment: dto.quantity },
          packageUnit,
          baseUnit,
          baseQuantityPerPackage,
          unit: baseUnit,
          receivedAt: new Date(),
          warehouseId: warehouse?.id,
          warehouseName: warehouse?.name ?? normalizeOptionalText(dto.warehouseName),
          unitCostCents: existingBatch?.unitCostCents ?? baseUnitCostCents
        }
      });
      const receiptCostRecord = await tx.purchaseReceiptCostRecord.create({
        data: {
          storeId: item.purchaseOrder.storeId,
          purchaseOrderItemId,
          inventoryBatchId: batch.id,
          receivedQuantity: dto.quantity,
          purchaseUnit: packageUnit,
          baseUnit,
          baseQuantity: baseReceivedQuantity,
          plannedUnitCostCents,
          actualUnitCostCents,
          baseUnitCostCents,
          differenceCents,
          differenceReason,
          createdById: actor.id
        }
      });
      await tx.auditEvent.create({
        data: {
          action: "PURCHASE_RECEIPT_COST_RECORDED",
          actorId: actor.id,
          storeId: item.purchaseOrder.storeId,
          targetType: "PurchaseReceiptCostRecord",
          targetId: receiptCostRecord.id,
          metadata: {
            purchaseOrderNo: item.purchaseOrder.orderNo,
            batchNo: dto.batchNo,
            plannedUnitCostCents,
            actualUnitCostCents,
            differenceCents,
            differenceReason
          }
        }
      });
      await tx.inventoryMovement.create({
        data: {
          storeId: item.purchaseOrder.storeId,
          batchId: batch.id,
          productId: item.productId,
          movementType: InventoryMovementType.PURCHASE_IN,
          quantity: baseReceivedQuantity,
          unit: baseUnit,
          fromUnit: packageUnit,
          toUnit: baseUnit,
          conversionRate: baseQuantityPerPackage,
          sourceType: "PURCHASE_ORDER_ITEM",
          sourceId: purchaseOrderItemId,
          idempotencyKey: dto.idempotencyKey,
          warehouseId: warehouse?.id,
          warehouseName: warehouse?.name ?? normalizeOptionalText(dto.warehouseName),
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
      return { ...batch, receiptCostRecord };
    });
  }

  async updatePurchaseReceiptCost(
    user: AuthenticatedInventoryUser,
    receiptCostRecordId: string,
    dto: UpdatePurchaseReceiptCostDto
  ) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const record = await tx.purchaseReceiptCostRecord.findUnique({
        where: { id: receiptCostRecordId },
        include: {
          purchaseOrderItem: { include: { purchaseOrder: true } },
          inventoryBatch: { select: { id: true, outboundQuantity: true } }
        }
      });
      if (!record) throw new NotFoundException("入库成本记录不存在");
    if (!await this.canAccess(actor, "purchase", "write", record.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (dto.actualUnitCostCents === undefined) {
        throw new BadRequestException("请填写实际入库单价，或明确清空为待补价");
      }
      const actualUnitCostCents = dto.actualUnitCostCents;
      const differenceCents = actualUnitCostCents == null || record.plannedUnitCostCents == null
        ? null
        : actualUnitCostCents - record.plannedUnitCostCents;
      const differenceReason = normalizeOptionalText(dto.costDifferenceReason);
      if (differenceCents !== null && differenceCents !== 0 && !differenceReason) {
        throw new BadRequestException("实际入库价与采购单价不一致时，请填写成本差异原因");
      }
      const baseQuantity = decimalToNumber(record.baseQuantity);
      const receivedQuantity = decimalToNumber(record.receivedQuantity);
      const baseUnitCostCents = actualUnitCostCents == null
        ? null
        : Math.round((actualUnitCostCents * receivedQuantity) / baseQuantity);
      if (baseUnitCostCents != null) {
        const conflictingRecord = await tx.purchaseReceiptCostRecord.findFirst({
          where: {
            inventoryBatchId: record.inventoryBatchId,
            id: { not: record.id },
            baseUnitCostCents: { not: baseUnitCostCents }
          },
          select: { id: true }
        });
        if (conflictingRecord) {
          throw new BadRequestException("同一批次只能保留一个实际入库成本；价格不同请使用新的批次号入库");
        }
      }
      const hasOutbound = decimalToNumber(record.inventoryBatch.outboundQuantity) > 0;
      if (hasOutbound && actualUnitCostCents == null && record.baseUnitCostCents != null) {
        throw new BadRequestException("该批次已有出库记录，不能清空已确认的实际入库价；如需更正请填写新的实际价格和差异原因");
      }
      const updated = await tx.purchaseReceiptCostRecord.update({
        where: { id: record.id },
        data: {
          actualUnitCostCents,
          baseUnitCostCents,
          differenceCents,
          differenceReason,
          updatedById: actor.id
        }
      });
      // 当前批次的真实单位成本始终以最近确认的实际入库价为准。已经出库
      // 的部分由下面的订单成本闭环处理，避免把历史已结算订单直接覆盖。
      await tx.inventoryBatch.update({
        where: { id: record.inventoryBatchId },
        data: { unitCostCents: baseUnitCostCents }
      });

      const unitCostDeltaCents = (baseUnitCostCents ?? 0) - (record.baseUnitCostCents ?? 0);
      let recalculatedUnsettledOrderCount = 0;
      let createdSettledDifferenceCount = 0;
      if (hasOutbound && unitCostDeltaCents !== 0) {
        const movements = await tx.inventoryMovement.findMany({
          where: {
            batchId: record.inventoryBatchId,
            orderId: { not: null },
            movementType: { in: [InventoryMovementType.ORDER_OUT, InventoryMovementType.DAMAGE_OUT] }
          },
          select: { orderId: true, quantity: true }
        });
        const quantityByOrder = new Map<string, number>();
        for (const movement of movements) {
          if (!movement.orderId) continue;
          quantityByOrder.set(movement.orderId, (quantityByOrder.get(movement.orderId) ?? 0) + decimalToNumber(movement.quantity));
        }
        if (quantityByOrder.size) {
          const settlements = await tx.constructionCostSettlement.findMany({
            where: { orderId: { in: [...quantityByOrder.keys()] } },
            include: { order: { include: { amount: true } } }
          });
          for (const settlement of settlements) {
            const materialDeltaCents = Math.round((quantityByOrder.get(settlement.orderId) ?? 0) * unitCostDeltaCents);
            if (!materialDeltaCents) continue;
            if (settlement.status === ConstructionCostSettlementStatus.CONFIRMED) {
              const actualMaterialCostCents = settlement.actualMaterialCostCents + materialDeltaCents;
              const actualTotalCostCents = actualMaterialCostCents + settlement.actualConstructionCostCents;
              const revenue = settlement.order.amount?.totalAmountCents ?? 0;
              await tx.constructionCostSettlement.update({
                where: { id: settlement.id },
                data: {
                  actualMaterialCostCents,
                  actualTotalCostCents,
                  actualGrossProfitCents: revenue - actualTotalCostCents,
                  actualGrossMarginBps: revenue > 0 ? Math.floor(((revenue - actualTotalCostCents) * 10000) / revenue) : -10000
                }
              });
              recalculatedUnsettledOrderCount += 1;
              await tx.auditEvent.create({
                data: {
                  action: "ORDER_MATERIAL_COST_RECALCULATED",
                  actorId: actor.id,
                  storeId: record.storeId,
                  targetType: "ConstructionCostSettlement",
                  targetId: settlement.id,
                  metadata: { purchaseReceiptCostRecordId: record.id, materialDeltaCents, reason: differenceReason }
                }
              });
            } else if (settlement.status === ConstructionCostSettlementStatus.SETTLED) {
              await tx.constructionCostAdjustment.create({
                data: {
                  settlementId: settlement.id,
                  adjustmentType: "MATERIAL_RECEIPT_COST_DIFFERENCE",
                  amountCents: materialDeltaCents,
                  reasonCode: "PURCHASE_RECEIPT_PRICE_DIFFERENCE",
                  reasonText: `采购实际入库价补录：${record.purchaseOrderItem.purchaseOrder.orderNo}，${differenceReason ?? "实际入库价变化"}`,
                  requestedById: actor.id
                }
              });
              createdSettledDifferenceCount += 1;
              await tx.auditEvent.create({
                data: {
                  action: "SETTLED_ORDER_MATERIAL_COST_DIFFERENCE_CREATED",
                  actorId: actor.id,
                  storeId: record.storeId,
                  targetType: "ConstructionCostSettlement",
                  targetId: settlement.id,
                  metadata: { purchaseReceiptCostRecordId: record.id, materialDeltaCents, reason: differenceReason }
                }
              });
            }
          }
        }
      }
      await tx.auditEvent.create({
        data: {
          action: "PURCHASE_RECEIPT_COST_UPDATED",
          actorId: actor.id,
          storeId: record.storeId,
          targetType: "PurchaseReceiptCostRecord",
          targetId: record.id,
          metadata: {
            purchaseOrderNo: record.purchaseOrderItem.purchaseOrder.orderNo,
            plannedUnitCostCents: record.plannedUnitCostCents,
            actualUnitCostCents,
            differenceCents,
            differenceReason,
            affectsFutureInventoryCost: true,
            recalculatedUnsettledOrderCount,
            createdSettledDifferenceCount
          }
        }
      });
      return {
        ...updated,
        affectsFutureInventoryCost: true,
        recalculatedUnsettledOrderCount,
        createdSettledDifferenceCount
      };
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

  private async resolveReceivingWarehouse(
    client: WarehouseLookupClient,
    storeId: string,
    warehouseId?: string,
    warehouseName?: string
  ) {
    const normalizedName = normalizeOptionalText(warehouseName);
    if (!warehouseId) return normalizedName ? { id: undefined, name: normalizedName } : undefined;
    const warehouse = await client.warehouse.findUnique({ where: { id: warehouseId } });
    if (!warehouse) throw new NotFoundException("仓库不存在");
    if (warehouse.storeId !== storeId) {
      throw new BadRequestException("仓库不属于当前门店");
    }
    if (!warehouse.isActive) {
      throw new BadRequestException("仓库已停用，不能继续入库");
    }
    return { id: warehouse.id, name: warehouse.name };
  }

  async lockOrderInventory(user: AuthenticatedInventoryUser, orderId: string) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: {
          items: { include: { product: true, inventoryAllocations: true } },
          crossStoreTask: true
        }
      });
      if (!order) throw new NotFoundException("订单不存在");
      if (!await this.canAccess(actor, "inventory", "write", (order.executionStoreId ?? order.storeId))) {
        throw new ForbiddenException("无权限");
      }

      const locked: Array<{ batchId: string; productId: string; quantity: number }> = [];
      const missing: Array<{ productId: string; orderItemId: string; quantity: number; unit: ProductUnit }> = [];
      for (const item of order.items) {
        const inventoryProductId = resolveCrossStoreExecutionProductId(
          order.crossStoreTask?.requirementsSnapshot,
          item.productId
        );
        const requiredQuantity = resolveCrossStoreExecutionRequiredQuantity(
          order.crossStoreTask?.requirementsSnapshot,
          item.productId,
          decimalToNumber(item.requiredBaseQuantity ?? item.quantity)
        );
        const requiredUnit = resolveCrossStoreExecutionUnit(
          order.crossStoreTask?.requirementsSnapshot,
          item.productId,
          item.baseUnit ?? item.product.unit
        );
        const coveredQuantity = (item.inventoryAllocations ?? [])
          .filter((allocation) => allocation.status !== "RELEASED")
          .reduce((sum, allocation) => sum + decimalToNumber(allocation.lockedQuantity), 0);
        let remaining = Math.max(0, requiredQuantity - coveredQuantity);
        const batches = await tx.inventoryBatch.findMany({
          where: { storeId: (order.executionStoreId ?? order.storeId), productId: inventoryProductId, availableQuantity: { gt: 0 } },
          orderBy: { receivedAt: "asc" }
        });
        for (const batch of batches) {
          if (remaining <= 0) break;
          const existingAllocation = (item.inventoryAllocations ?? []).find((allocation) => allocation.batchId === batch.id);
          if (existingAllocation && existingAllocation.status !== "RELEASED") continue;
          const quantity = Math.min(decimalToNumber(batch.availableQuantity), remaining);
          await tx.inventoryBatch.update({
            where: { id: batch.id },
            data: {
              availableQuantity: { decrement: quantity },
              lockedQuantity: { increment: quantity }
            }
          });
          const allocation = existingAllocation
            ? await tx.orderInventoryAllocation.update({
              where: { id: existingAllocation.id },
              data: {
                lockedQuantity: quantity,
                outboundQuantity: 0,
                status: "LOCKED",
                lockedById: actor.id,
                lockedAt: new Date(),
                outboundById: null,
                outboundAt: null
              }
            })
            : await tx.orderInventoryAllocation.create({
              data: {
                storeId: (order.executionStoreId ?? order.storeId),
                orderId,
                crossStoreTaskId: order.crossStoreTask?.id,
                orderItemId: item.id,
                productId: inventoryProductId,
                batchId: batch.id,
                lockedQuantity: quantity,
                lockedById: actor.id
              }
            });
          await tx.inventoryMovement.create({
            data: {
              storeId: (order.executionStoreId ?? order.storeId),
              batchId: batch.id,
              productId: inventoryProductId,
              crossStoreTaskId: order.crossStoreTask?.id,
              orderId,
              movementType: InventoryMovementType.ORDER_LOCK,
              quantity,
              unit: batch.unit,
              sourceType: "ORDER_INVENTORY_ALLOCATION",
              sourceId: allocation.id,
              createdById: actor.id,
              note: "订单库存锁定"
            }
          });
          locked.push({ batchId: batch.id, productId: inventoryProductId, quantity });
          remaining -= quantity;
        }
        if (remaining > 0) {
          missing.push({ productId: inventoryProductId, orderItemId: item.id, quantity: remaining, unit: requiredUnit });
        }
      }

      const purchaseRequirement = missing.length > 0
        ? await tx.purchaseRequirement.create({
          data: {
            storeId: (order.executionStoreId ?? order.storeId),
            sourceOrderId: orderId,
            crossStoreTaskId: order.crossStoreTask?.id,
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

      if (locked.length || purchaseRequirement) await this.invalidateOrderLifecycleWithin(tx, orderId, "INVENTORY_ALLOCATION", `LOCK:${orderId}:${locked.map((item) => item.batchId).join(",")}`, { locked, missing: missing.length });
      return { locked, missing, purchaseRequirement };
    });
  }

  async outboundOrderInventory(user: AuthenticatedInventoryUser, orderId: string, dto?: OutboundOrderInventoryDto) {
    const actor = await this.withStoreMember(user);
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException("订单不存在");
      if (!await this.canAccess(actor, "inventory", "write", (order.executionStoreId ?? order.storeId))) {
        throw new ForbiddenException("无权限");
      }
      const allocations = await tx.orderInventoryAllocation.findMany({
        where: {
          orderId,
          status: "LOCKED",
          ...(dto?.lines?.length ? { id: { in: dto.lines.map((line) => line.allocationId) } } : {})
        },
        include: { batch: true, product: true }
      });
      const allocationsById = new Map(allocations.map((allocation) => [allocation.id, allocation]));
      const outboundLines = dto?.lines?.length
        ? dto.lines
        : allocations.map((allocation) => ({
          allocationId: allocation.id,
          quantity: decimalToNumber(allocation.lockedQuantity) - decimalToNumber(allocation.outboundQuantity),
          unit: allocation.batch.unit
        }));

      for (const line of outboundLines) {
        const allocation = allocationsById.get(line.allocationId);
        if (!allocation) {
          throw new BadRequestException("出库明细不存在或未锁定");
        }
        const remainingLocked = decimalToNumber(allocation.lockedQuantity) - decimalToNumber(allocation.outboundQuantity);
        const quantity = this.convertProductQuantityOrReject({
          quantity: line.quantity,
          fromUnit: line.unit,
          toUnit: allocation.batch.unit,
          product: allocation.product,
          packageUnit: allocation.batch.packageUnit,
          baseQuantityPerPackage: decimalToNumber(allocation.batch.baseQuantityPerPackage ?? 1),
          action: "出库"
        });
        if (quantity <= 0) continue;
        if (quantity > remainingLocked) {
          throw new BadRequestException("出库数量不能超过已锁定未出库数量");
        }
        const fullyOutbound = quantity >= remainingLocked;
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
            status: fullyOutbound ? "OUTBOUND" : "LOCKED",
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
            unit: allocation.batch.unit,
            fromUnit: line.unit,
            toUnit: allocation.batch.unit,
            conversionRate: decimalToNumber(allocation.batch.baseQuantityPerPackage ?? 1),
            sourceType: "ORDER_INVENTORY_ALLOCATION",
            sourceId: allocation.id,
            createdById: actor.id,
            note: "订单施工出库"
          }
        });
      }
      if (outboundLines.length) await this.invalidateOrderLifecycleWithin(tx, orderId, "INVENTORY_OUTBOUND", `OUTBOUND:${orderId}:${outboundLines.map((line) => line.allocationId).join(",")}`, { allocationIds: outboundLines.map((line) => line.allocationId) });
      return { outbound: outboundLines.length };
    });
  }

  async convertBatchUnit(user: AuthenticatedInventoryUser, batchId: string, dto: ConvertBatchUnitDto) {
    const actor = await this.withStoreMember(user);
    const batch = await this.prisma.inventoryBatch.findUnique({ where: { id: batchId } });
    if (!batch) throw new NotFoundException("库存批次不存在");
    if (!await this.canAccess(actor, "inventory", "write", batch.storeId)) {
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
    if (!await this.canAccess(actor, "inventory", "write", batch.storeId)) {
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
    if (!await this.canAccess(actor, "inventory", "write", batch.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (dto.idempotencyKey) {
        const existingMovement = await tx.inventoryMovement.findFirst({
          where: {
            storeId: batch.storeId,
            sourceType: "STOCK_OPERATION",
            sourceId: batch.id,
            idempotencyKey: dto.idempotencyKey
          }
        });
        if (existingMovement) return existingMovement;
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
          idempotencyKey: dto.idempotencyKey,
          createdById: actor.id,
          note: dto.note
        }
      });
    });
  }

  private async assertActiveSupplier(
    storeId: string,
    supplierName: string,
    client: Pick<PrismaService, "supplier"> = this.prisma
  ) {
    const normalizedName = normalizeRequiredText(supplierName, "供应商名称");
    const supplier = await client.supplier.findFirst({
      where: { storeId, name: normalizedName },
      select: { id: true, isActive: true }
    });
    if (!supplier) {
      throw new BadRequestException("供应商不存在，请先在供应商档案中维护");
    }
    if (!supplier.isActive) {
      throw new BadRequestException("供应商已暂停，不能创建新的采购订单");
    }
    return normalizedName;
  }

  private convertInventoryQuantityOrReject(input: Parameters<typeof convertToBaseQuantity>[0] & { action: string }) {
    const { action, ...conversionInput } = input;
    try {
      return convertToBaseQuantity(conversionInput);
    } catch {
      throw new BadRequestException(`${action}单位与当前批次库存单位不匹配；请检查产品的每卷米数和入库批次换算关系`);
    }
  }

  private convertProductQuantityOrReject(input: {
    quantity: number;
    fromUnit: ProductUnit;
    toUnit: ProductUnit;
    product?: {
      metersPerRoll?: number | { toNumber?: () => number; toString: () => string } | null;
      quantityPrecision?: number | null;
    } | null;
    packageUnit?: ProductUnit | null;
    baseQuantityPerPackage?: number | null;
    action: string;
  }) {
    if (!Number.isFinite(input.quantity) || input.quantity < 0) {
      throw new BadRequestException(`${input.action}数量格式不正确`);
    }
    const precision = Math.min(3, Math.max(0, input.product?.quantityPrecision ?? 3));
    if (input.fromUnit === input.toUnit) return Number(input.quantity.toFixed(precision));
    const metersPerRoll = input.product?.metersPerRoll ? decimalToNumber(input.product.metersPerRoll) : 0;
    if (metersPerRoll > 0 && [input.fromUnit, input.toUnit].every((unit) => unit === ProductUnit.ROLL || unit === ProductUnit.METER)) {
      const quantity = input.fromUnit === ProductUnit.ROLL
        ? input.quantity * metersPerRoll
        : input.quantity / metersPerRoll;
      return Number(quantity.toFixed(precision));
    }
    return this.convertInventoryQuantityOrReject({
      quantity: input.quantity,
      fromUnit: input.fromUnit,
      baseUnit: input.toUnit,
      packageUnit: input.packageUnit,
      baseQuantityPerPackage: input.baseQuantityPerPackage,
      precision,
      action: input.action
    });
  }

  private async resolvePurchaseOrderPurchaser(
    actor: UserWithStoreMember,
    storeId: string,
    requestedPurchaserId?: string
  ) {
    const purchaserId = requestedPurchaserId ?? actor.id;
    if (purchaserId === actor.id) return purchaserId;
    if (!await this.canAccess(actor, "store", "write", storeId)) {
      throw new ForbiddenException("仅店长可指定其他采购员");
    }
    const member = await this.prisma.storeMember.findUnique({
      where: { storeId_userId: { storeId, userId: purchaserId } },
      select: { position: true }
    });
    if (!member || (member.position !== StorePosition.MANAGER && member.position !== StorePosition.PURCHASING)) {
      throw new BadRequestException("采购员必须是本店店长或采购人员");
    }
    return purchaserId;
  }

  private async invalidateOrderLifecycleWithin(
    tx: Prisma.TransactionClient,
    orderId: string,
    sourceType: string,
    sourceKey: string,
    sourceRefs: Prisma.InputJsonObject
  ) {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { lifecycleVersion: true } });
    if (!order) throw new NotFoundException("订单不存在");
    const updated = await tx.order.updateMany({
      where: { id: orderId, lifecycleVersion: order.lifecycleVersion },
      data: { lifecycleVersion: { increment: 1 } }
    });
    if (updated.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "订单履约事实已被其他操作更新，请刷新后重试" });
    await tx.orderLifecycleVersionChange.create({
      data: {
        orderId,
        beforeVersion: order.lifecycleVersion,
        afterVersion: order.lifecycleVersion + 1,
        sourceType,
        sourceKey,
        sourceRefs
      }
    });
  }

  private async withStoreMember(user: AuthenticatedInventoryUser): Promise<UserWithStoreMember> {
    return user;
  }
}

function buildPurchaseOrderNo() {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `PO${stamp}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function buildDateRangeFilter(createdFrom?: string, createdTo?: string) {
  if (!createdFrom && !createdTo) return undefined;
  return {
    ...(createdFrom ? { gte: new Date(`${createdFrom.slice(0, 10)}T00:00:00.000Z`) } : {}),
    ...(createdTo ? { lte: new Date(`${createdTo.slice(0, 10)}T23:59:59.999Z`) } : {})
  };
}

function decimalToNumber(value: number | { toNumber?: () => number; toString: () => string }) {
  if (typeof value === "number") return value;
  if (typeof value.toNumber === "function") return value.toNumber();
  return Number(value.toString());
}

function isPendingInventoryMatchOrder(order: {
  crossStoreTask?: { requirementsSnapshot?: unknown } | null;
  items?: Array<{
    productId: string;
    quantity: number | { toNumber?: () => number; toString: () => string };
    requiredBaseQuantity?: number | { toNumber?: () => number; toString: () => string } | null;
    baseUnit?: ProductUnit | null;
    product?: {
      unit?: ProductUnit | null;
      inventoryUnit?: ProductUnit | null;
      metersPerRoll?: number | { toNumber?: () => number; toString: () => string } | null;
    } | null;
    inventoryAllocations?: Array<{
      status?: string | null;
      lockedQuantity?: number | { toNumber?: () => number; toString: () => string } | null;
      outboundQuantity?: number | { toNumber?: () => number; toString: () => string } | null;
      batch?: { unit?: ProductUnit | null } | null;
    }>;
  }>;
}) {
  return (order.items ?? []).some((item) => {
    const crossRequirement = resolveCrossStoreRequirementItem(
      order.crossStoreTask?.requirementsSnapshot,
      item.productId
    );
    const requiredQuantity = resolveCrossStoreExecutionRequiredQuantity(
      order.crossStoreTask?.requirementsSnapshot,
      item.productId,
      decimalToNumber(item.requiredBaseQuantity ?? item.quantity)
    );
    if (requiredQuantity <= 0) return false;
    const targetUnit = resolveCrossStoreExecutionUnit(
      order.crossStoreTask?.requirementsSnapshot,
      item.productId,
      item.baseUnit ?? item.product?.inventoryUnit ?? item.product?.unit ?? ProductUnit.PIECE
    );
    const outboundQuantity = (item.inventoryAllocations ?? [])
      .reduce((sum, allocation) => {
        const quantity = toNullableDecimalNumber(allocation.outboundQuantity);
        if (crossRequirement) return sum + quantity;
        return sum + convertOrderAllocationQuantity(
          quantity,
          allocation.batch?.unit ?? targetUnit,
          targetUnit,
          item.product?.metersPerRoll
        );
      }, 0);
    return outboundQuantity < requiredQuantity;
  });
}
function convertOrderAllocationQuantity(
  quantity: number,
  fromUnit: ProductUnit,
  toUnit: ProductUnit,
  metersPerRoll?: number | { toNumber?: () => number; toString: () => string } | null
) {
  if (fromUnit === toUnit) return quantity;
  const rate = metersPerRoll ? decimalToNumber(metersPerRoll) : 0;
  if (rate > 0 && [fromUnit, toUnit].every((unit) => unit === ProductUnit.ROLL || unit === ProductUnit.METER)) {
    return fromUnit === ProductUnit.ROLL ? quantity * rate : quantity / rate;
  }
  return quantity;
}

function toNullableDecimalNumber(value?: number | { toNumber?: () => number; toString: () => string } | null) {
  if (value === undefined || value === null) return 0;
  return decimalToNumber(value);
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
