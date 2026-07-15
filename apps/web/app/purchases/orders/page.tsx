"use client";

import { Alert, Button, Card, Select, Space, Table, Tag } from "antd";
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import { getPurchaseInboundItemDetails, getPurchaseOrderArrivalReminder, getPurchaseOrderStatusLabel } from "../../../src/features/inventory/display";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";
import { exportRowsToExcel } from "../../../src/lib/export-excel";
import { useState } from "react";

type PurchaseOrderRow = {
  id: string;
  orderNo?: string;
  status?: string;
  supplierName?: string | null;
  expectedAt?: string | null;
  items?: unknown[];
};

type PurchaseExportDimension = "supplier" | "product" | "date";

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
  const [exportDimension, setExportDimension] = useState<PurchaseExportDimension>("supplier");
  const exportOrders = () => {
    const exportRows = [...rows].sort((left, right) => {
      if (exportDimension === "date") return String(left.expectedAt ?? "").localeCompare(String(right.expectedAt ?? ""));
      if (exportDimension === "product") return getPurchaseProductSummary(left).localeCompare(getPurchaseProductSummary(right));
      return String(left.supplierName ?? "").localeCompare(String(right.supplierName ?? ""));
    });
    exportRowsToExcel(`purchase-orders-by-${exportDimension}.xlsx`, "采购订单", exportRows.map((row) => ({
      采购单号: row.orderNo ?? "",
      供应商: row.supplierName ?? "",
      产品: getPurchaseProductSummary(row),
      状态: getPurchaseOrderStatusLabel(row.status),
      预计到货: row.expectedAt ?? ""
    })));
  };

  return (
    <div className="management-page purchases-orders-page">
      <StorePageHeader title="采购订单" description="查看采购订单、审批状态、预计到货和到货验收进度。">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/purchases")}>返回采购总览</Button>
        <Select
          aria-label="采购订单导出维度"
          value={exportDimension}
          onChange={setExportDimension}
          options={[{ label: "按供应商导出", value: "supplier" }, { label: "按产品导出", value: "product" }, { label: "按日期导出", value: "date" }]}
          style={{ width: 150 }}
        />
        <Button icon={<DownloadOutlined />} disabled={rows.length === 0} onClick={exportOrders}>导出明细</Button>
        <Button type="primary" icon={<PlusOutlined />} disabled={!canManagePurchase} onClick={() => router.push("/purchases/orders/create")}>
          从采购需求创建
        </Button>
      </StorePageHeader>

      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          title="只读模式"
          description="客服可查看采购订单和到货状态，不能审批、取消或入库。"
        />
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
                { title: "到货验收", render: (_, row) => getPurchaseOrderArrivalReminder(row as never) },
                {
                  title: "操作",
                  width: 140,
                  render: (_, row) => (
                    <Space>
                      <Button
                        size="small"
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/purchases/orders/${row.id}`);
                        }}
                      >
                        查看/处理
                      </Button>
                    </Space>
                  )
                }
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}

function getPurchaseProductSummary(row: PurchaseOrderRow) {
  return (row.items ?? []).map((item) => getPurchaseInboundItemDetails(item as never).product).filter(Boolean).join("；") || "-";
}
