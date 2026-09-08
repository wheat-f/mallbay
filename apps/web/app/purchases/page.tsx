"use client";

import { Alert, Button, Card } from "antd";
import { CheckCircleOutlined, ShoppingCartOutlined, TeamOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { purchaseApi } from "../../src/lib/api";
import { PurchaseModuleNav } from "../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../src/features/permissions/use-effective-permissions";

type PurchaseOverview = {
  openRequirementCount?: number;
  pendingApprovalCount?: number;
  pendingInboundCount?: number;
  supplierCount?: number;
  requirements?: unknown[];
  orders?: unknown[];
};

export default function PurchasesOverviewPage() {
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManagePurchase = hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "write", storeId);
  const overviewQuery = useQuery({
    queryKey: ["purchases-overview", storeId],
    queryFn: () => purchaseApi.overview(storeId!),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "read", storeId))
  });
  const overview = (overviewQuery.data ?? {}) as PurchaseOverview;
  const requirementCount = overview.openRequirementCount ?? overview.requirements?.length ?? 0;
  const orderCount = overview.orders?.length ?? 0;

  return (
    <div className="management-page purchases-overview-shell">
      <StorePageHeader title="采购管理总览" description="汇总采购需求、采购订单、到货验收和供应商档案的当前状态。">
        <Button href="/purchases/requirements" icon={<CheckCircleOutlined />}>
          采购需求
        </Button>
        <Button href="/purchases/orders/create" disabled={!canManagePurchase} icon={<ShoppingCartOutlined />}>
          从需求创建采购单
        </Button>
        <Button href="/purchases/orders" type="primary" icon={<ShoppingCartOutlined />}>
          采购订单
        </Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看采购需求、采购订单、到货验收和供应商档案，不能新增、审批、取消、入库或维护供应商。"
        />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="overview" />
        <div className="purchase-module-content">
          <div className="management-kpi-grid">
            {[
              ["采购需求", requirementCount, "待下单或待跟进"],
              ["采购订单", orderCount, "当前采购订单总数"],
              ["到货验收", overview.pendingInboundCount ?? 0, "待到货或部分到货"],
              ["供应商档案", overview.supplierCount ?? 0, "可用供应商与历史快照"]
            ].map(([label, value, description]) => (
              <Card key={label} className="management-kpi-card" loading={overviewQuery.isLoading}>
                <div className="management-kpi-label">{label}</div>
                <div className="management-kpi-value">{value}</div>
                <div className="management-kpi-desc">{description}</div>
              </Card>
            ))}
          </div>

          <section className="purchases-overview-grid">
            <Card className="inventory-prototype-card" title="采购流转概览">
              <div className="purchase-overview-flow">
                <Link href="/purchases/requirements">
                  <span>1</span>
                  <strong>采购需求</strong>
                  <small>查看缺货、人工申请和待转单需求</small>
                </Link>
                <Link href="/purchases/orders/create" aria-disabled={!canManagePurchase}>
                  <span>2</span>
                  <strong>从需求创建采购单</strong>
                  <small>选择未生成订购的需求并补充采购信息</small>
                </Link>
                <Link href="/purchases/orders">
                  <span>3</span>
                  <strong>采购订单</strong>
                  <small>处理审批、取消、到货验收和入库</small>
                </Link>
              </div>
            </Card>

            <Card className="inventory-prototype-card" title="采购工作入口">
              <div className="purchase-overview-actions">
                <Link href="/purchases/requirements">
                  <CheckCircleOutlined />
                  <span>
                    <strong>采购需求列表</strong>
                    <small>进入列表查看全部需求并处理转单</small>
                  </span>
                </Link>
                <Link href="/purchases/orders">
                  <ShoppingCartOutlined />
                  <span>
                    <strong>采购订单列表</strong>
                    <small>进入列表查看订单和到货状态</small>
                  </span>
                </Link>
                <Link href="/purchases/suppliers">
                  <TeamOutlined />
                  <span>
                    <strong>供应商档案</strong>
                    <small>维护联系人、评级和结算信息</small>
                  </span>
                </Link>
              </div>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
