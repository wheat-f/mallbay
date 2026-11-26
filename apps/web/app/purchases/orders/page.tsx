"use client";

import { Alert, App, Button, Card, Input, Select, Space, Table, Tag } from "antd";
import { ArrowLeftOutlined, DownloadOutlined, PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { purchaseApi } from "../../../src/lib/api";
import { getPurchaseInboundItemDetails, getPurchaseOrderArrivalReminder, getPurchaseOrderStatusLabel } from "../../../src/features/inventory/display";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";
import { exportRowsToExcel } from "../../../src/lib/export-excel";
import { getProductUnitLabel } from "../../../src/features/products/display";
import { useMemo, useState } from "react";

type PurchaseOrderRow = {
  id: string;
  orderNo?: string;
  status?: string;
  supplierName?: string | null;
  purchaser?: { username?: string | null; nickname?: string | null } | null;
  expectedAt?: string | null;
  items?: unknown[];
};

type PurchaseExportDimension = "supplier" | "product" | "date";

export default function PurchasesOrdersPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canManagePurchase = hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "write", storeId);
  const ordersQuery = useQuery({
    queryKey: ["purchase-orders", storeId],
    queryFn: () => purchaseApi.orders(storeId!),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "purchase", "read", storeId))
  });
  const rows = useMemo(() => (ordersQuery.data ?? []) as PurchaseOrderRow[], [ordersQuery.data]);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [keyword, setKeyword] = useState("");
  const [exportDimension, setExportDimension] = useState<PurchaseExportDimension>("supplier");
  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (kw) {
        const text = [
          row.orderNo,
          row.supplierName,
          row.purchaser?.nickname,
          row.purchaser?.username,
          ...(row.items ?? []).map((item) => getPurchaseInboundItemDetails(item as never).product)
        ].filter(Boolean).join(" ").toLowerCase();
        if (!text.includes(kw)) return false;
      }
      return true;
    });
  }, [rows, statusFilter, keyword]);
  const exportMutation = useMutation({
    mutationFn: () => purchaseApi.exportOrderDetails(storeId!, exportDimension),
    onSuccess: async (exportRows) => {
      if (exportRows.length === 0) {
        message.warning("当前门店没有可导出的采购产品明细");
        return;
      }
      await exportRowsToExcel(
        `purchase-order-product-details-by-${exportDimension}.xlsx`,
        "采购订单产品明细",
        exportRows.map((row) => ({
          采购单号: row.orderNo,
          供应商: row.supplierName,
          采购员: row.purchaserName,
          产品品牌: row.productBrand,
          产品名称: row.productName,
          产品型号: row.productModel,
          产品规格: row.productSpecification ?? "",
          采购数量: row.quantity,
          已入库数量: row.receivedQuantity,
          待入库数量: row.pendingQuantity,
          单位: row.inventoryUnit ? getProductUnitLabel(row.inventoryUnit) : "",
          采购含税单价: row.plannedUnitCostCents == null ? "待填写" : row.plannedUnitCostCents / 100,
          产品行金额: row.itemAmountCents == null ? "待填写" : row.itemAmountCents / 100,
          状态: getPurchaseOrderStatusLabel(row.status),
          预计到货: formatPurchaseExportDate(row.expectedAt),
          创建时间: formatPurchaseExportDate(row.createdAt)
        })),
        { title: "采购订单产品明细", subtitle: `按${exportDimension === "supplier" ? "供应商" : exportDimension === "date" ? "日期" : "产品"}维度导出，逐产品行展示` }
      );
      message.success(`已导出 ${exportRows.length} 条采购产品明细`);
    },
    onError: () => message.error("采购订单明细导出失败，请稍后重试")
  });

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
        <Button
          icon={<DownloadOutlined />}
          disabled={!storeId || rows.length === 0}
          loading={exportMutation.isPending}
          onClick={() => exportMutation.mutate()}
        >
          导出产品明细
        </Button>
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
          {ordersQuery.isError ? <Alert type="error" showIcon title="采购订单加载失败，请稍后刷新" className="mb-3" /> : null}
          <Card className="management-table-card">
            <div className="management-table-toolbar finance-list-toolbar">
              <div className="mb-segmented-tabs" role="tablist" aria-label="采购订单状态">
                {[
                  { key: "ALL", label: "全部" },
                  { key: "PENDING_APPROVAL", label: "待审批" },
                  { key: "APPROVED", label: "已审批" },
                  { key: "PARTIAL_RECEIVED", label: "部分入库" },
                  { key: "RECEIVED", label: "已入库" },
                  { key: "CANCELLED", label: "已取消" }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.key}
                    className={`mb-segmented-tab${statusFilter === tab.key ? " is-active" : ""}`}
                    onClick={() => setStatusFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className="finance-list-toolbar-actions">
                <Input.Search
                  allowClear
                  prefix={<SearchOutlined />}
                  placeholder="搜索单号、供应商或采购员"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  style={{ width: 260 }}
                />
                <Button icon={<ReloadOutlined />} onClick={() => { setStatusFilter("ALL"); setKeyword(""); }}>
                  重置
                </Button>
              </div>
            </div>
            <Table<PurchaseOrderRow>
              rowKey="id"
              loading={ordersQuery.isLoading}
              dataSource={filteredRows}
              scroll={{ x: "max-content" }}
              pagination={{ pageSize: 10 }}
              onRow={(row) => ({ onClick: () => router.push(`/purchases/orders/${row.id}`) })}
              columns={[
                { title: "采购单", width: 170, render: (_, row) => row.orderNo ?? "未编号采购单" },
                { title: "供应商", width: 140, render: (_, row) => row.supplierName ?? "供应商待确认" },
                { title: "采购员", width: 120, render: (_, row) => row.purchaser?.nickname ?? row.purchaser?.username ?? "采购员待确认" },
                { title: "状态", width: 110, render: (_, row) => <Tag>{getPurchaseOrderStatusLabel(row.status)}</Tag> },
                { title: "采购明细", width: 180, render: (_, row) => (row.items ?? []).map((item) => getPurchaseInboundItemDetails(item as never).product).join(" / ") || "明细待确认" },
                { title: "到货验收", width: 160, render: (_, row) => getPurchaseOrderArrivalReminder(row as never) },
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

function formatPurchaseExportDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}
