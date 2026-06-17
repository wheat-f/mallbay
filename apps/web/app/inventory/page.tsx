"use client";

import type { InventoryBatchSummary, InventoryMovementType } from "@mallbay/shared";
import { Alert, Button, Card, Table, Tag, Typography } from "antd";
import { AppstoreOutlined, ArrowRightOutlined, FileSearchOutlined, SwapOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { inventoryApi } from "../../src/lib/api";
import { getInventoryMovementSummary, getInventoryMovementTypeLabel } from "../../src/features/inventory/display";
import { getProductDisplayName } from "../../src/features/products/display";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../src/stores/auth-store";

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
  const canManageInventory = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";

  const batchesQuery = useQuery({
    queryKey: ["inventory-overview-batches", storeId],
    queryFn: () => inventoryApi.batches({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const pendingOrdersQuery = useQuery({
    queryKey: ["inventory-overview-pending-orders", storeId],
    queryFn: () => inventoryApi.pendingMatchOrders(storeId!),
    enabled: Boolean(storeId)
  });
  const movementsQuery = useQuery({
    queryKey: ["inventory-overview-movements", storeId],
    queryFn: () => inventoryApi.movements({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const batchRows = useMemo(() => (batchesQuery.data ?? []) as InventoryBatchSummary[], [batchesQuery.data]);
  const pendingRows = useMemo(() => {
    const data = pendingOrdersQuery.data as PendingMatchOrderRow[] | { items?: PendingMatchOrderRow[] } | undefined;
    if (Array.isArray(data)) return data;
    return data?.items ?? [];
  }, [pendingOrdersQuery.data]);
  const movementRows = useMemo(() => (movementsQuery.data ?? []) as MovementRow[], [movementsQuery.data]);
  const movementSummary = getInventoryMovementSummary(movementRows);
  const lowStockRows = batchRows.filter((batch) => Number(batch.availableQuantity ?? 0) <= 1).slice(0, 5);
  const lockedRows = batchRows.filter((batch) => Number(batch.lockedQuantity ?? 0) > 0).slice(0, 5);
  const selectedOrderMessage = "请先选择待匹配订单";

  return (
    <div className="management-page inventory-overview-shell">
      <StorePageHeader title="库存运营总览" description="查看库存健康、订单匹配、锁库出库和库存流水，采购事项已拆到采购管理。">
        <Button icon={<FileSearchOutlined />} href="/inventory/matching">
          库存匹配
        </Button>
        {canManageInventory ? (
          <Button type="primary" icon={<AppstoreOutlined />} href="/inventory/adjustments">
            库存调整工作台
          </Button>
        ) : null}
      </StorePageHeader>

      {!canManageInventory ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          message="只读模式"
          description="客服可查看库存匹配建议、批次、锁库结果和库存流水，不能执行锁库、出库、调整或其他库存操作。"
        />
      ) : null}

      <div className="management-kpi-grid">
        {[
          ["库存健康", batchRows.length, "当前可追踪批次数"],
          ["待匹配订单", pendingRows.length, "等待库存匹配或确认"],
          ["低库存与异常批次", lowStockRows.length, "可用数量低于安全线"],
          ["锁库待出库", lockedRows.length, "已锁定但未完成出库"]
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
          <Card className="inventory-prototype-card" title="待匹配订单" extra={<Link href="/inventory/matching">进入匹配</Link>}>
            <div className="inventory-overview-order-cards">
              {pendingRows.slice(0, 5).map((row) => (
                <article key={row.id} className="inventory-overview-order-card">
                  <strong>{row.orderNo ?? "未编号订单"}</strong>
                  <span>{getInventoryOrderCustomerLabel(row)}</span>
                  <small>{getInventoryOrderItemsSummary(row)}</small>
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
                { title: "预约", render: (_, row) => formatInventoryOrderDate(row.appointmentDate) }
              ]}
            />
            <Typography.Text type="secondary">{selectedOrderMessage}</Typography.Text>
          </Card>

          <Card className="inventory-prototype-card" title="低库存与异常批次">
            <Table<InventoryBatchSummary>
              rowKey="id"
              size="small"
              loading={batchesQuery.isLoading}
              dataSource={lowStockRows}
              pagination={false}
              columns={[
                { title: "批次号", dataIndex: "batchNo" },
                { title: "产品", render: (_, row) => row.product ? getProductDisplayName({
                  brand: row.product.brand ?? undefined,
                  name: row.product.name ?? undefined,
                  model: row.product.model ?? undefined
                }) : "产品信息待确认" },
                { title: "可用", render: (_, row) => <Tag color="warning">{String(row.availableQuantity ?? 0)}</Tag> }
              ]}
            />
          </Card>
        </div>

        <aside className="inventory-overview-aside">
          <Card className="inventory-prototype-card" title="库存流程入口">
            <div className="inventory-overview-shortcuts">
              <Link href="/inventory/matching"><strong>订单库存匹配</strong><span>查看匹配建议、锁库结果和待出库订单</span><ArrowRightOutlined /></Link>
              {canManageInventory ? (
                <Link href="/inventory/adjustments"><strong>库存调整工作台</strong><span>单位转换、盘点、报损、调拨和退货</span><ArrowRightOutlined /></Link>
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
                  <strong>{String(row.lockedQuantity ?? 0)}</strong>
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
