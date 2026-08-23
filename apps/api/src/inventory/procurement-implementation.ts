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
import { InventoryLedger, type InventoryLedgerTransaction } from "./domain/inventory-ledger";
import { InventoryCatalog } from "./inventory-catalog";

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
export class ProcurementImplementation {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    private readonly inventoryLedger: InventoryLedger,
    private readonly inventoryCatalog: InventoryCatalog
  ) {}

  private canAccess(actor: AuthenticatedInventoryUser, capability: string, action: string, storeId: string) {
    return this.accessContext.can({ userId: actor.id }, capability, action, { storeId });
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
    return this.prisma.$transaction(async (tx) => {
      const purchaseOrder = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
      if (!purchaseOrder) throw new NotFoundException("采购订单不存在");
      if (!await this.canAccess(actor, "purchase", "write", purchaseOrder.storeId)) {
        throw new ForbiddenException("无权限");
      }
      if (purchaseOrder.status !== PurchaseOrderStatus.DRAFT && purchaseOrder.status !== PurchaseOrderStatus.ORDERED) {
        throw new BadRequestException("当前采购订单状态不允许取消");
      }
      const result = await tx.purchaseOrder.update({
        where: { id: purchaseOrderId },
        data: { status: PurchaseOrderStatus.CANCELLED }
      });
      await tx.auditEvent.create({
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
    });
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
      this.inventoryCatalog.listSuppliers(user, storeId)
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
    const idempotencyKey = dto.idempotencyKey?.trim();
    if (!idempotencyKey) throw new BadRequestException("收货幂等键不能为空");
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
      const stockResult = await this.inventoryLedger.receivePurchaseWithin(tx as InventoryLedgerTransaction, {
        storeId: item.purchaseOrder.storeId,
        purchaseOrderItemId,
        productId: item.productId,
        batchNo: dto.batchNo,
        supplierName: dto.supplierName ?? item.purchaseOrder.supplierName,
        quantity: dto.quantity,
        packageUnit,
        baseUnit,
        baseQuantityPerPackage,
        baseQuantity: baseReceivedQuantity,
        unitCostCents: baseUnitCostCents,
        warehouseId: warehouse?.id,
        warehouseName: warehouse?.name ?? normalizeOptionalText(dto.warehouseName),
        actorId: actor.id,
        idempotencyKey,
        note: `采购单 ${item.purchaseOrder.orderNo} 入库`
      });
      const batch = stockResult.batch;
      if (stockResult.replayed) {
        const receiptCostRecord = await tx.purchaseReceiptCostRecord.findFirst({
          where: { purchaseOrderItemId, inventoryBatchId: batch.id },
          orderBy: { createdAt: "asc" }
        });
        if (!receiptCostRecord || receiptCostRecord.receivedQuantity.toString() !== dto.quantity.toString()
          || receiptCostRecord.actualUnitCostCents !== actualUnitCostCents
          || receiptCostRecord.baseUnit !== baseUnit
          || receiptCostRecord.purchaseUnit !== packageUnit
          || receiptCostRecord.differenceReason !== differenceReason) {
          throw new ConflictException("收货幂等键已被不同收货内容使用");
        }
        return { ...batch, receiptCostRecord };
      }
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
      await this.inventoryLedger.updatePurchaseReceiptCostWithin(tx as InventoryLedgerTransaction, {
        batchId: record.inventoryBatchId,
        unitCostCents: baseUnitCostCents
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
