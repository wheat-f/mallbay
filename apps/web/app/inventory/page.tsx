"use client";

import type { InventoryBatchSummary, InventoryMovementType } from "@mallbay/shared";
import { Alert, Button, Card, Table, Tag, Typography } from "antd";
import { ArrowRightOutlined, FileSearchOutlined, SwapOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "../../src/lib/api";
import {
  formatBatchLockedStockLabel,
  formatBatchPhysicalStockLabel,
  formatBatchStockLabel,
  getInventoryBatchAttentionLabels,
  getInventoryBatchStockSnapshot,
  getInventoryMovementSummary,
  getInventoryMovementTypeLabel
} from "../../src/features/inventory/display";
import { getProductDisplayName } from "../../src/features/products/display";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../src/features/permissions/use-effective-permissions";

type PendingMatchOrderRow = {
  id: string;
  orderNo?: string;
  status?: string;
  appointmentDate?: string | Date | null;
  customer?: {
    name?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
  } | null;
  vehicle?: {
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
  } | null;
  items?: Array<{
    product?: {
      brand?: string;
      name?: string;
      model?: string;
      specification?: string | null;
    } | null;
    quantity?: number;
  }>;
};

type MovementRow = {
  id: string;
  movementType?: InventoryMovementType;
  quantity?: number | string;
  createdAt?: string | Date;
};

export default function InventoryOverviewPage() {
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManageInventory = hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "write", storeId);

  const batchesQuery = useQuery({
    queryKey: ["inventory-overview-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "read", storeId))
  });
  const pendingOrdersQuery = useQuery({
    queryKey: ["inventory-overview-pending-orders", storeId],
    queryFn: () => inventoryApi.pendingMatchOrders(storeId!),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "read", storeId))
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory-overview-movements", storeId],
    queryFn: () => inventoryApi.movements({ storeId: storeId! }),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "inventory", "read", storeId))
  });
  const batchRows = useMemo(() => (batchesQuery.data ?? []) as InventoryBatchSummary[], [batchesQuery.data]);
  const pendingRows = useMemo(() => {
    const data = pendingOrdersQuery.data as PendingMatchOrderRow[] | { items?: PendingMatchOrderRow[] } | undefined;
    if (Array.isArray(data)) return data;
    return data?.items ?? [];
  }, [pendingOrdersQuery.data]);
  const movementRows = useMemo(() => (movementsQuery.data ?? []) as MovementRow[], [movementsQuery.data]);
  const movementSummary = getInventoryMovementSummary(movementRows);
  const attentionRows = useMemo(
    () => batchRows.filter((batch) => getInventoryBatchStockSnapshot(batch).needsAttention),
    [batchRows]
  );
  const lowStockRows = attentionRows.slice(0, 5);
  const lockedBatchRows = useMemo(
    () => batchRows.filter((batch) => getInventoryBatchStockSnapshot(batch).lockedQuantity > 0),
    [batchRows]
  );
  const lockedRows = lockedBatchRows.slice(0, 5);
  return (
    <div className="management-page inventory-overview-shell">
      <StorePageHeader title="库存运营总览" description="查看库存健康、订单匹配、锁库出库和库存流水，采购事项已拆到采购管理。">
        <Button icon={<FileSearchOutlined />} href="/inventory/matching">
          库存匹配
        </Button>
      </StorePageHeader>

      {!canManageInventory ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看库存匹配建议、批次、锁库结果和库存流水，不能执行锁库、出库、调整或其他库存操作。"
        />
      ) : null}

      <div className="management-kpi-grid">
        {[
          ["库存健康", batchRows.length, "当前可追踪批次数"],
          ["待匹配订单", pendingRows.length, "等待库存匹配或确认"],
          ["低库存与异常批次", attentionRows.length, "按实物剩余统计，含部分出库批次"],
          ["锁库待出库", lockedBatchRows.length, "已锁定但未完成出库"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card inventory-summary-tile">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value inventory-summary-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </div>

      <section className="inventory-overview-grid">
        <div className="inventory-overview-main">
          <Card className="inventory-prototype-card" title="待匹配订单">
            <div className="inventory-overview-order-cards">
              {pendingRows.slice(0, 5).map((row) => (
                <article key={row.id} className="inventory-overview-order-card">
                  <strong>{row.orderNo ?? "未编号订单"}</strong>
                  <span>{getInventoryOrderCustomerLabel(row)}</span>
                  <small>{getInventoryOrderItemsSummary(row)}</small>
                  <Link href={`/inventory/matching?orderId=${row.id}`} className="inventory-overview-row-action">
                    进入匹配
                  </Link>
                </article>
              ))}
            </div>
            <Table<PendingMatchOrderRow>
              className="inventory-overview-order-table"
              rowKey="id"
              loading={pendingOrdersQuery.isLoading}
              dataSource={pendingRows.slice(0, 6)}
              pagination={false}
              columns={[
                { title: "订单号", render: (_, row) => row.orderNo ?? "未编号订单" },
                { title: "客户", render: (_, row) => getInventoryOrderCustomerLabel(row) },
                { title: "产品", render: (_, row) => getInventoryOrderItemsSummary(row) },
                { title: "预约", render: (_, row) => formatInventoryOrderDate(row.appointmentDate) },
                {
                  title: "操作",
                  render: (_, row) => (
                    <Link href={`/inventory/matching?orderId=${row.id}`} className="inventory-overview-row-action">
                      进入匹配
                    </Link>
                  )
                }
              ]}
            />
          </Card>

          <Card className="inventory-prototype-card" title="低库存与异常批次">
            <Table<InventoryBatchSummary>
              rowKey="id"
              size="small"
              loading={batchesQuery.isLoading}
              dataSource={lowStockRows}
              pagination={false}
              scroll={{ x: 1000 }}
              columns={[
                { title: "批次号", dataIndex: "batchNo" },
                { title: "产品", render: (_, row) => row.product ? getProductDisplayName({
                  brand: row.product.brand ?? undefined,
                  name: row.product.name ?? undefined,
                  model: row.product.model ?? undefined
                }) : "产品信息待确认" },
                { title: "实物剩余", render: (_, row) => <Tag color="blue">{formatBatchPhysicalStockLabel(row)}</Tag> },
                { title: "可用", render: (_, row) => <Tag>{formatBatchStockLabel(row)}</Tag> },
                { title: "锁定", render: (_, row) => <Tag color="gold">{formatBatchLockedStockLabel(row)}</Tag> },
                {
                  title: "状态",
                  render: (_, row) => getInventoryBatchAttentionLabels(row).map((label) => (
                    <Tag key={label} color={label === "数据异常" ? "red" : label === "已耗尽" ? "default" : "warning"}>
                      {label}
                    </Tag>
                  ))
                }
              ]}
            />
          </Card>
        </div>

        <aside className="inventory-overview-aside">
          <Card className="inventory-prototype-card" title="库存流程入口">
            <div className="inventory-overview-shortcuts">
              <Link href="/inventory/matching"><strong>订单库存匹配</strong><span>查看匹配建议、锁库结果和待出库订单</span><ArrowRightOutlined /></Link>
              {canManageInventory ? (
                <Link href="/inventory/warehouses"><strong>仓库管理</strong><span>配置门店仓库、库区和启用状态</span><ArrowRightOutlined /></Link>
              ) : null}
              <Link href="/inventory/movements"><strong>库存流水</strong><span>按产品、批次、订单和操作人追踪</span><ArrowRightOutlined /></Link>
              <Link href="/purchases"><strong>采购管理</strong><span>采购需求、采购订单、到货验收</span><ArrowRightOutlined /></Link>
            </div>
          </Card>

          <Card className="inventory-prototype-card" title="锁库待出库">
            <div className="inventory-overview-lock-list">
              {lockedRows.length > 0 ? lockedRows.map((row) => (
                <div key={row.id} className="inventory-overview-lock-row">
                  <span>{row.batchNo}</span>
                  <strong>{formatBatchLockedStockLabel(row)}</strong>
                </div>
              )) : <Typography.Text type="secondary">暂无锁库待出库批次</Typography.Text>}
            </div>
          </Card>

          <Card className="inventory-prototype-card" title="库存流水">
            <div className="inventory-overview-movement-summary">
              {[
                ["入库合计", movementSummary.inbound],
                ["出库合计", movementSummary.outbound],
                ["锁定合计", movementSummary.locked],
                ["调整合计", movementSummary.adjustments]
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            {movementRows.slice(0, 4).map((row) => (
              <div key={row.id} className="inventory-overview-movement-row">
                <SwapOutlined />
                <span>{row.movementType ? getInventoryMovementTypeLabel(row.movementType) : "库存流水"}</span>
                <strong>{String(row.quantity ?? 0)}</strong>
              </div>
            ))}
          </Card>
        </aside>
      </section>
    </div>
  );
}

function formatInventoryOrderDate(value?: string | Date | null) {
  if (!value) return "预约日期待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "预约日期待确认";
  return date.toISOString().slice(0, 10);
}

function getInventoryOrderCustomerLabel(order: PendingMatchOrderRow) {
  return order.customer?.companyName ?? order.customer?.name ?? order.customer?.contactPerson ?? "客户待确认";
}

function getInventoryOrderItemsSummary(order: PendingMatchOrderRow) {
  const items = order.items ?? [];
  if (items.length === 0) return "产品待确认";
  return items
    .map((item) => {
      const product = item.product;
      const label = product ? [product.brand, product.name, product.model].filter(Boolean).join(" ") : "产品信息待确认";
      return `${label} x ${item.quantity ?? 0}`;
    })
    .join(" / ");
}
