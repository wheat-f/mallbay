"use client";

import { Alert, Button, Card, Table, Tag } from "antd";
import { ArrowLeftOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import { getPurchaseInboundItemDetails, getPurchaseOrderArrivalReminder, getPurchaseOrderStatusLabel } from "../../../src/features/inventory/display";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type PurchaseOrderRow = {
  id: string;
  orderNo?: string;
  status?: string;
  supplierName?: string | null;
  expectedAt?: string | null;
  items?: unknown[];
};

export default function PurchasesOrdersPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", storeId],
    queryFn: () => purchaseApi.orders(storeId!),
    enabled: Boolean(storeId)
  });
  const rows = (ordersQuery.data ?? []) as PurchaseOrderRow[];

  return (
    <div className="management-page purchases-orders-page">
      <StorePageHeader title="采购订单" description="查看采购订单、审批状态、预计到货和到货验收进度。">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases")}>返回采购总览</Button>
        <Button type="primary" icon={<PlusOutlined />} disabled={!canManagePurchase} onClick={() => router.push("/purchases/requirements")}>
          从采购需求创建
        </Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert className="management-readonly-alert" type="info" showIcon message="只读模式" description="客服可查看采购订单和到货状态，不能审批、取消或入库。" />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="orders" />
        <div className="purchase-module-content">
          <Card className="management-table-card">
            <Table<PurchaseOrderRow>
              rowKey="id"
              loading={ordersQuery.isLoading}
              dataSource={rows}
              pagination={{ pageSize: 10 }}
              onRow={(row) => ({ onClick: () => router.push(`/purchases/orders/${row.id}`) })}
              columns={[
                { title: "采购单", render: (_, row) => row.orderNo ?? "未编号采购单" },
                { title: "供应商", render: (_, row) => row.supplierName ?? "供应商待确认" },
                { title: "状态", render: (_, row) => <Tag>{getPurchaseOrderStatusLabel(row.status)}</Tag> },
                { title: "采购明细", render: (_, row) => (row.items ?? []).map((item) => getPurchaseInboundItemDetails(item as never).product).join(" / ") || "明细待确认" },
                { title: "到货验收", render: (_, row) => getPurchaseOrderArrivalReminder(row as never) }
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
