"use client";

import { Alert, Button, Card, Table, Tag } from "antd";
import { CheckCircleOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { purchaseApi } from "../../src/lib/api";
import { getPurchaseOrderArrivalReminder, getPurchaseOrderStatusLabel, getPurchaseRequirementItemsSummary, getPurchaseRequirementStatusLabel } from "../../src/features/inventory/display";
import { PurchaseModuleNav } from "../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../src/stores/auth-store";

type PurchaseOverview = {
  openRequirementCount?: number;
  pendingApprovalCount?: number;
  pendingInboundCount?: number;
  supplierCount?: number;
  requirements?: PurchaseRequirementRow[];
  orders?: PurchaseOrderRow[];
};

type PurchaseRequirementRow = {
  id: string;
  status?: string;
  items?: unknown[];
};

type PurchaseOrderRow = {
  id: string;
  orderNo?: string;
  status?: string;
  supplierName?: string | null;
  expectedAt?: string | null;
};

export default function PurchasesOverviewPage() {
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const overviewQuery = useQuery({
    queryKey: ["purchases-overview", storeId],
    queryFn: () => purchaseApi.overview(storeId!),
    enabled: Boolean(storeId)
  });
  const overview = (overviewQuery.data ?? {}) as PurchaseOverview;
  const requirementRows = useMemo(() => overview.requirements ?? [], [overview.requirements]);
  const orderRows = useMemo(() => overview.orders ?? [], [overview.orders]);
  const productLookup = useMemo(() => new Map(), []);

  return (
    <div className="management-page purchases-overview-shell">
      <StorePageHeader title="采购管理总览" description="管理采购需求、采购订单、到货验收和供应商档案。">
        {canManagePurchase ? (
          <Button href="/purchases/requirements" icon={<CheckCircleOutlined />}>
            新建采购需求
          </Button>
        ) : null}
        <Button href="/purchases/orders" type="primary" icon={<ShoppingCartOutlined />}>
          采购订单
        </Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          message="只读模式"
          description="客服可查看采购需求、采购订单、到货验收和供应商档案，不能新增、审批、取消、入库或维护供应商。"
        />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="overview" />
        <div className="purchase-module-content">
          <div className="management-kpi-grid">
            {[
              ["采购需求", overview.openRequirementCount ?? requirementRows.length, "待下单或待跟进"],
              ["采购订单", orderRows.length, "当前采购订单总数"],
              ["到货验收", overview.pendingInboundCount ?? 0, "待到货或部分到货"],
              ["供应商档案", overview.supplierCount ?? 0, "可用供应商与历史快照"]
            ].map(([label, value, description]) => (
              <Card key={label} className="management-kpi-card">
                <div className="management-kpi-label">{label}</div>
                <div className="management-kpi-value">{value}</div>
                <div className="management-kpi-desc">{description}</div>
              </Card>
            ))}
          </div>

          <section className="purchases-overview-grid">
            <Card className="inventory-prototype-card" title="采购需求" extra={<Link href="/purchases/requirements">查看全部</Link>}>
              <Table<PurchaseRequirementRow>
                rowKey="id"
                loading={overviewQuery.isLoading}
                dataSource={requirementRows.slice(0, 5)}
                pagination={false}
                columns={[
                  { title: "需求状态", render: (_, row) => <Tag>{getPurchaseRequirementStatusLabel(row.status)}</Tag> },
                  { title: "需求明细", render: (_, row) => getPurchaseRequirementItemsSummary(row as never, productLookup) }
                ]}
              />
            </Card>

            <Card className="inventory-prototype-card" title="采购订单" extra={<Link href="/purchases/orders">查看全部</Link>}>
              <Table<PurchaseOrderRow>
                rowKey="id"
                loading={overviewQuery.isLoading}
                dataSource={orderRows.slice(0, 5)}
                pagination={false}
                columns={[
                  { title: "采购单", render: (_, row) => row.orderNo ?? "未编号采购单" },
                  { title: "供应商", render: (_, row) => row.supplierName ?? "供应商待确认" },
                  { title: "状态", render: (_, row) => <Tag>{getPurchaseOrderStatusLabel(row.status)}</Tag> },
                  { title: "到货验收", render: (_, row) => getPurchaseOrderArrivalReminder(row as never) }
                ]}
              />
            </Card>

          </section>
        </div>
      </div>
    </div>
  );
}
