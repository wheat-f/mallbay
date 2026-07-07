"use client";

import type { OrderStatus, WarrantySummary } from "@mallbay/shared";
import { Button, Card, Input, Select, Table, Tag } from "antd";
import {
  DownloadOutlined,
  FileProtectOutlined,
  PrinterOutlined,
  SearchOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { orderApi, warrantiesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getWarrantyExpiryReminder,
  getWarrantyStatusLabel
} from "../../src/features/warranties/display";

type OrderWorkRow = {
  id: string;
  orderNo?: string | null;
  status?: OrderStatus | null;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  customer?: {
    name?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
    personalName?: string | null;
  } | null;
  vehicle?: {
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
    plateNo?: string | null;
    model?: string | null;
    color?: string | null;
  } | null;
};

type WarrantyWorkRow = OrderWorkRow & {
  warranty?: WarrantySummary;
};

const WARRANTY_WORK_STATUSES: Array<{ value: "ALL" | OrderStatus; label: string }> = [
  { value: "ALL", label: "全部工单" },
  { value: "PENDING_DISPATCH", label: "待派单" },
  { value: "DISPATCHED", label: "已派工" },
  { value: "IN_CONSTRUCTION", label: "施工中" },
  { value: "COMPLETED", label: "已完工" },
  { value: "WARRANTIED", label: "已质保" },
  { value: "CANCELLED", label: "已取消" }
];

export default function WarrantiesPage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | OrderStatus>("ALL");

  const warrantiesQuery = useQuery({
    queryKey: ["warranties", storeId],
    queryFn: () => warrantiesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const ordersQuery = useQuery({
    queryKey: ["warranties", "work-orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });

  const warrantyRows = useMemo(() => (warrantiesQuery.data ?? []) as WarrantySummary[], [warrantiesQuery.data]);
  const warrantyByOrderId = useMemo(() => {
    const map = new Map<string, WarrantySummary>();
    warrantyRows.forEach((warranty) => map.set(warranty.orderId, warranty));
    return map;
  }, [warrantyRows]);
  const workRows = useMemo(() => {
    const rows = ((ordersQuery.data?.items ?? []) as OrderWorkRow[]).map((order) => ({
      ...order,
      warranty: warrantyByOrderId.get(order.id)
    }));
    return rows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      const text = [row.orderNo, getOrderCustomerName(row), getOrderVehicleLabel(row), getOrderStatusLabel(row.status)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return keyword.trim() ? text.includes(keyword.trim().toLowerCase()) : true;
    });
  }, [keyword, ordersQuery.data?.items, statusFilter, warrantyByOrderId]);
  const completedWithoutWarranty = workRows.filter((row) => row.status === "COMPLETED" && !row.warranty).length;
  const activeWarranties = warrantyRows.filter((row) => row.status === "ACTIVE").length;

  return (
    <div className="management-page">
      <StorePageHeader title="质保管理" description="查看施工工单、生成电子质保、查询质保状态和售后追溯。" />

      <section className="warranty-command-bar">
        <div className="warranty-command-copy">
          <span>质保工作台</span>
          <strong>完工后生成质保，已质保可直接查看电子质保卡</strong>
        </div>
        <div className="warranty-command-actions">
          <Button icon={<PrinterOutlined />}>批量打印</Button>
          <Button icon={<DownloadOutlined />}>导出记录</Button>
          <Button type="primary" icon={<FileProtectOutlined />} onClick={() => router.push("/warranties/create")}>
            生成电子质保
          </Button>
        </div>
      </section>

      <div className="management-kpi-grid">
        {[
          ["工单总数", ordersQuery.data?.total ?? 0, "当前门店施工订单"],
          ["已完工待生成", completedWithoutWarranty, "可生成电子质保"],
          ["有效质保", activeWarranties, "可用于售后追溯"],
          ["质保记录", warrantyRows.length, "全部电子质保"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </div>

      <section className="warranty-filter-panel">
        <div className="warranty-filter-search">
          <span>工单搜索</span>
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="订单号 / 客户 / 车牌"
            allowClear
            onSearch={setKeyword}
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>
        <div className="warranty-filter-field">
          <span>工单状态</span>
          <Select value={statusFilter} options={WARRANTY_WORK_STATUSES} onChange={setStatusFilter} />
        </div>
      </section>

      <section className="warranty-workspace warranty-workspace-list">
        <div className="warranty-main-column">
          <Card
            className="warranty-record-list"
            title="工单列表"
            extra={<span className="warranty-table-count">{workRows.length} 条</span>}
          >
            <div className="warranty-mobile-cards">
              {workRows.length > 0 ? (
                workRows.map((row) => (
                  <article key={row.id} className="warranty-mobile-card">
                    <div className="warranty-mobile-card-head">
                      <div className="min-w-0">
                        <strong>{row.orderNo ?? "未编号订单"}</strong>
                        <span>{getOrderCustomerName(row)} / {getOrderVehicleLabel(row)}</span>
                      </div>
                      <Tag>{getOrderStatusLabel(row.status)}</Tag>
                    </div>
                    <dl className="warranty-mobile-fields">
                      <div>
                        <dt>预约</dt>
                        <dd>{formatAppointment(row)}</dd>
                      </div>
                      <div>
                        <dt>质保</dt>
                        <dd>{row.warranty ? getWarrantyStatusLabel(row.warranty.status) : getWarrantyActionText(row)}</dd>
                      </div>
                    </dl>
                    {renderWarrantyAction(row, router)}
                  </article>
                ))
              ) : (
                <div className="warranty-mobile-empty">暂无工单</div>
              )}
            </div>
            <Table<WarrantyWorkRow>
              className="warranty-desktop-table"
              rowKey="id"
              loading={ordersQuery.isLoading || warrantiesQuery.isLoading}
              dataSource={workRows}
              pagination={{ pageSize: 8 }}
              scroll={{ x: 980 }}
              columns={[
                { title: "工单", width: 160, render: (_, row) => row.orderNo ?? "未编号订单" },
                { title: "客户", width: 180, render: (_, row) => getOrderCustomerName(row) },
                { title: "车辆", width: 190, render: (_, row) => getOrderVehicleLabel(row) },
                { title: "预约", width: 170, render: (_, row) => formatAppointment(row) },
                { title: "工单状态", width: 110, render: (_, row) => <Tag>{getOrderStatusLabel(row.status)}</Tag> },
                {
                  title: "质保状态",
                  width: 140,
                  render: (_, row) => {
                    if (!row.warranty) return <Tag>{getWarrantyActionText(row)}</Tag>;
                    const reminder = getWarrantyExpiryReminder(row.warranty);
                    return <Tag color={reminder.color}>{getWarrantyStatusLabel(row.warranty.status)}</Tag>;
                  }
                },
                {
                  title: "操作",
                  width: 160,
                  render: (_, row) => renderWarrantyAction(row, router)
                }
              ]}
            />
          </Card>
        </div>

        <aside className="warranty-side-column warranty-support-grid">
          <Card className="warranty-preview-panel" title="电子质保说明">
            <div className="warranty-guide-grid warranty-guide-grid-side">
              <article className="warranty-launch-card">
                <span><SafetyCertificateOutlined /></span>
                <div>
                  <h3>生成条件</h3>
                  <p>只有已完工且尚未生成质保的工单，才显示生成电子质保入口。</p>
                </div>
              </article>
              <article className="warranty-audit-guide">
                <span><FileProtectOutlined /></span>
                <div>
                  <h3>查看条件</h3>
                  <p>已存在质保记录的工单显示查看电子质保，非完工工单不展示质保操作。</p>
                </div>
              </article>
            </div>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function renderWarrantyAction(row: WarrantyWorkRow, router: ReturnType<typeof useRouter>) {
  if (row.warranty) {
    return (
      <Button size="small" onClick={() => router.push(`/warranties/${row.warranty?.id}`)}>
        查看电子质保
      </Button>
    );
  }
  if (row.status === "COMPLETED") {
    return (
      <Button size="small" type="primary" onClick={() => router.push(`/warranties/create?orderId=${row.id}`)}>
        生成电子质保
      </Button>
    );
  }
  return null;
}

function getWarrantyActionText(row: WarrantyWorkRow) {
  if (row.status === "COMPLETED") return "待生成";
  if (row.status === "WARRANTIED") return "已生成";
  return "暂不处理";
}

function getOrderCustomerName(row: OrderWorkRow) {
  return row.customer?.companyName ?? row.customer?.personalName ?? row.customer?.name ?? row.customer?.contactPerson ?? "未登记客户";
}

function getOrderVehicleLabel(row: OrderWorkRow) {
  const plate = row.vehicle?.carPlate ?? row.vehicle?.plateNo;
  const model = row.vehicle?.carModel ?? row.vehicle?.model;
  const color = row.vehicle?.carColor ?? row.vehicle?.color;
  return [plate, model, color].filter(Boolean).join(" / ") || "车辆未登记";
}

function getOrderStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    PENDING_DISPATCH: "待派单",
    DISPATCHED: "已派工",
    IN_CONSTRUCTION: "施工中",
    COMPLETED: "已完工",
    WARRANTIED: "已质保",
    CANCELLED: "已取消"
  };
  return status ? labels[status] ?? status : "-";
}

function formatAppointment(row: OrderWorkRow) {
  const date = formatWarrantyDate(row.appointmentDate);
  return [date, row.appointmentTimeSlot].filter(Boolean).join(" ") || "-";
}

function formatWarrantyDate(value?: string | null) {
  if (!value) return "";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "质保日期待确认";
}
