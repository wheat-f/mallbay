"use client";

import type { ConstructionType, OrderStatus } from "@mallbay/shared";
import { App, Button, Card, DatePicker, Input, Popconfirm, Progress, Select, Space, Table, Tag, Typography } from "antd";
import {
  CreditCardOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined
} from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { orderApi } from "../../src/lib/api";
import type { OrderPaymentStatus } from "../../src/features/orders/api";
import {
  CONSTRUCTION_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  getConstructionTypeLabel,
  getOrderStatusLabel,
  yuanCurrency
} from "../../src/features/orders/order-display";
import { getProductUnitLabel } from "../../src/features/products/display";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { exportRowsToExcel } from "../../src/lib/export-excel";
import { OrderPaymentDrawer } from "../../src/features/orders/order-payment-drawer";
import {
  type CreateOrderDraft,
  loadCreateOrderDraft,
  removeCreateOrderDraft
} from "../../src/features/orders/create-order-draft";

type OrderRow = {
  id: string;
  orderNo: string;
  status: string;
  constructionType: string;
  customer?: { name?: string | null; companyName?: string | null };
  vehicle?: { carPlate?: string | null; carModel?: string | null; carColor?: string | null } | null;
  salesPerson?: { username?: string | null; nickname?: string | null } | null;
  amount?: { totalAmountCents: number; paidAmountCents: number; outstandingCents: number } | null;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  createdAt: string;
};

type SalesExportDimension = "customer" | "date" | "product";

const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  UNPAID: "未收款",
  PARTIAL: "部分收款",
  PAID: "已收清"
};

const QUICK_STATUS_OPTIONS: Array<{ label: string; value?: OrderStatus; tone: string }> = [
  { label: "全部订单", value: undefined, tone: "default" },
  { label: "待派工", value: "PENDING_DISPATCH", tone: "warning" },
  { label: "已派工", value: "DISPATCHED", tone: "processing" },
  { label: "施工中", value: "IN_CONSTRUCTION", tone: "processing" },
  { label: "已完工", value: "COMPLETED", tone: "success" },
  { label: "已质保", value: "WARRANTIED", tone: "success" },
  { label: "已取消", value: "CANCELLED", tone: "default" }
];

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="management-page" />}>
      <OrdersContent />
    </Suspense>
  );
}

type OrderListFilterState = {
  q?: string;
  status?: OrderStatus;
  constructionType?: ConstructionType;
  paymentStatus?: OrderPaymentStatus;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  pageSize?: number;
};

function OrdersContent() {
  const { message } = App.useApp();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const storeId = user?.storeMember?.store.id;
  const [q, setQ] = useState(() => searchParams.get("q") ?? "");
  const [status, setStatus] = useState<OrderStatus | undefined>(() =>
    toOptionalParam(searchParams.get("status")) as OrderStatus | undefined
  );
  const [constructionType, setConstructionType] = useState<ConstructionType | undefined>(() =>
    toOptionalParam(searchParams.get("constructionType")) as ConstructionType | undefined
  );
  const [paymentStatus, setPaymentStatus] = useState<OrderPaymentStatus | undefined>(() =>
    toOptionalParam(searchParams.get("paymentStatus")) as OrderPaymentStatus | undefined
  );
  const [createdFrom, setCreatedFrom] = useState<string | undefined>(() => toOptionalParam(searchParams.get("createdFrom")));
  const [createdTo, setCreatedTo] = useState<string | undefined>(() => toOptionalParam(searchParams.get("createdTo")));
  const [page, setPage] = useState(() => toPositiveNumber(searchParams.get("page"), 1));
  const [pageSize, setPageSize] = useState(() => toPositiveNumber(searchParams.get("pageSize"), 20));
  const [paymentOrder, setPaymentOrder] = useState<OrderRow | null>(null);
  const [exportDimension, setExportDimension] = useState<SalesExportDimension>("customer");
  const [deletedDraftStoreId, setDeletedDraftStoreId] = useState<string | null>(null);
  const localDraft = useMemo<CreateOrderDraft | null>(() => {
    if (
      !hasHydrated ||
      !storeId ||
      deletedDraftStoreId === storeId ||
      typeof window === "undefined"
    ) return null;
    return loadCreateOrderDraft(window.localStorage, storeId);
  }, [deletedDraftStoreId, hasHydrated, storeId]);

  const updateOrderListUrl = (next: Partial<OrderListFilterState>) => {
    const filters: OrderListFilterState = {
      q,
      status,
      constructionType,
      paymentStatus,
      createdFrom,
      createdTo,
      page,
      pageSize,
      ...next
    };
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) {
        params.set(key, String(value));
      }
    }
    const queryString = params.toString();
    router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
  };

  const resetFilters = () => {
    setQ("");
    setStatus(undefined);
    setConstructionType(undefined);
    setPaymentStatus(undefined);
    setCreatedFrom(undefined);
    setCreatedTo(undefined);
    setPage(1);
    updateOrderListUrl({
      q: undefined,
      status: undefined,
      constructionType: undefined,
      paymentStatus: undefined,
      createdFrom: undefined,
      createdTo: undefined,
      page: 1
    });
  };

  const ordersQuery = useQuery({
    queryKey: ["orders", storeId, q, status, constructionType, paymentStatus, createdFrom, createdTo, page, pageSize],
    queryFn: () =>
      orderApi.list({
        storeId: storeId!,
        q,
        status,
        constructionType,
        paymentStatus,
        createdFrom,
        createdTo,
        page,
        pageSize
      }),
    enabled: Boolean(storeId)
  });

  const rows = useMemo(() => (ordersQuery.data?.items ?? []) as OrderRow[], [ordersQuery.data]);
  const openOrderPaymentEntry = (order: OrderRow) => {
    setPaymentOrder(order);
  };
  const openOrderInvoiceEntry = (orderId: string) => {
    router.push(`/invoices?action=create-invoice&orderId=${orderId}`);
  };
  const exportMutation = useMutation({
    mutationFn: () => orderApi.exportDetails({
      storeId: storeId!,
      q,
      status,
      constructionType,
      paymentStatus,
      createdFrom,
      createdTo,
      exportDimension
    }),
    onSuccess: async (exportRows) => {
      if (exportRows.length === 0) {
        message.warning("当前筛选条件下没有可导出的产品明细");
        return;
      }
      await exportRowsToExcel(
        `sales-order-product-details-by-${exportDimension}.xlsx`,
        "销售订单产品明细",
        exportRows.map((row) => ({
          订单号: row.orderNo,
          客户: row.customerName,
          车辆: row.vehicle,
          产品品牌: row.productBrand,
          产品名称: row.productName,
          产品型号: row.productModel,
          产品规格: row.productSpecification ?? "",
          数量: row.quantity,
          单位: row.salesUnit ? getProductUnitLabel(row.salesUnit) : "",
          单价: row.unitPriceCents / 100,
          产品行金额: row.itemAmountCents / 100,
          商品小计: row.productAmountCents / 100,
           施工收费: row.constructionChargeCents / 100,
           整单金额_每行重复: row.orderTotalCents / 100,
          已收金额_每行重复: row.paidAmountCents / 100,
          待收金额_每行重复: row.outstandingCents / 100,
          状态: getOrderStatusLabel(row.status),
          施工类型: getConstructionTypeLabel(row.constructionType),
          预约日期: formatOrderListDate(row.appointmentDate),
          预约时段: row.appointmentTimeSlot ?? "",
          创建时间: formatOrderListDate(row.createdAt)
        })),
        { title: "销售订单产品明细", subtitle: `按${exportDimension === "customer" ? "客户" : exportDimension === "date" ? "日期" : "产品"}维度导出，逐产品行展示` }
      );
      message.success(`已导出 ${exportRows.length} 条销售产品明细`);
    },
    onError: () => message.error("销售订单明细导出失败，请稍后重试")
  });
  const orderSummary = useMemo(() => {
    const totalAmount = rows.reduce((sum, row) => sum + (row.amount?.totalAmountCents ?? 0), 0);
    const outstanding = rows.reduce((sum, row) => sum + (row.amount?.outstandingCents ?? 0), 0);
    const riskyCount = rows.filter((row) => (row.amount?.outstandingCents ?? 0) > 0 || row.status === "CANCELLED").length;
    const inProgressCount = rows.filter((row) => row.status === "DISPATCHED" || row.status === "IN_CONSTRUCTION").length;

    return {
      total: ordersQuery.data?.total ?? rows.length,
      totalAmount,
      outstanding,
      riskyCount,
      inProgressCount
    };
  }, [ordersQuery.data?.total, rows]);

  return (
    <>
      <div className="management-page">
          <StorePageHeader title="销售订单列表" description="查看销售订单、施工类型和收款进度">
            <Select
              aria-label="销售订单导出维度"
              value={exportDimension}
              onChange={setExportDimension}
              options={[{ label: "按客户导出", value: "customer" }, { label: "按日期导出", value: "date" }, { label: "按产品导出", value: "product" }]}
              style={{ width: 140 }}
            />
            <Button
              icon={<DownloadOutlined />}
              disabled={!storeId || (ordersQuery.data?.total ?? 0) === 0}
              loading={exportMutation.isPending}
              onClick={() => exportMutation.mutate()}
            >
              导出产品明细
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/orders/create")}>
              新建订单
            </Button>
          </StorePageHeader>

          {localDraft ? (
            <Card className="orders-local-draft-card">
              <div className="orders-local-draft-content">
                <div className="orders-local-draft-summary">
                  <Space wrap>
                    <Tag color="gold">本机草稿</Tag>
                    <Typography.Text strong>{localDraft.summary.customerName}</Typography.Text>
                    <Typography.Text type="secondary">
                      {localDraft.summary.productCount} 项产品 · ¥{localDraft.summary.totalAmountYuan.toFixed(2)}
                    </Typography.Text>
                  </Space>
                  <Typography.Text type="secondary">
                    保存于 {dayjs(localDraft.savedAt).format("YYYY-MM-DD HH:mm")}
                  </Typography.Text>
                </div>
                <Space>
                  <Button type="primary" onClick={() => router.push("/orders/create?draft=local")}>
                    继续编辑
                  </Button>
                  <Popconfirm
                    title="删除本机订单草稿？"
                    description="删除后无法恢复。"
                    okText="删除"
                    cancelText="取消"
                    onConfirm={() => {
                      removeCreateOrderDraft(localStorage);
                      setDeletedDraftStoreId(storeId ?? null);
                      message.success("订单草稿已删除");
                    }}
                  >
                    <Button danger>删除草稿</Button>
                  </Popconfirm>
                </Space>
              </div>
            </Card>
          ) : null}

          <div className="management-kpi-grid management-kpi-grid-five">
            {[
              ["订单总数", orderSummary.total, "当前筛选范围"],
              ["订单总额", yuanCurrency(orderSummary.totalAmount), "当前页合计"],
              ["待收金额", yuanCurrency(orderSummary.outstanding), "需持续跟进"],
              ["履约中", orderSummary.inProgressCount, "已派工/施工中"],
              ["异常关注", orderSummary.riskyCount, "未收或取消"]
            ].map(([label, value, description]) => (
              <Card key={label} className="management-kpi-card">
                <div className="management-kpi-label">{label}</div>
                <div className="management-kpi-value">{value}</div>
                <div className="management-kpi-desc">{description}</div>
              </Card>
            ))}
          </div>

          <section className="management-filter-card orders-filter-card">
            <div className="management-filter-actions mb-3">
              {QUICK_STATUS_OPTIONS.map((option) => {
                const active = status === option.value || (!status && !option.value);
                return (
                  <Button
                    key={option.label}
                    type={active ? "primary" : "default"}
                    onClick={() => {
                      setStatus(option.value);
                      setPage(1);
                      updateOrderListUrl({ status: option.value, page: 1 });
                    }}
                  >
                    <Tag color={active ? undefined : option.tone} className="mr-1">
                      {option.label}
                    </Tag>
                  </Button>
                );
              })}
            </div>
            <div className="management-filter-grid orders-filter-grid">
              <div className="orders-filter-item orders-filter-wide">
                <span className="orders-filter-label">关键词</span>
                <Input.Search
                  prefix={<SearchOutlined />}
                  placeholder="订单号 / 客户 / 车牌"
                  allowClear
                  defaultValue={q}
                  onSearch={(value) => {
                    const nextQ = value.trim();
                    setQ(nextQ);
                    setPage(1);
                    updateOrderListUrl({ q: nextQ || undefined, page: 1 });
                  }}
                />
              </div>
              <div className="orders-filter-item orders-filter-date">
                <span className="orders-filter-label">下单日期</span>
                <DatePicker.RangePicker
                  className="w-full"
                  format="YYYY-MM-DD"
                  value={[createdFrom ? dayjs(createdFrom) : null, createdTo ? dayjs(createdTo) : null]}
                  onChange={(_, dateStrings) => {
                    const [from, to] = dateStrings;
                    const nextCreatedFrom = from || undefined;
                    const nextCreatedTo = to || undefined;
                    setCreatedFrom(nextCreatedFrom);
                    setCreatedTo(nextCreatedTo);
                    setPage(1);
                    updateOrderListUrl({ createdFrom: nextCreatedFrom, createdTo: nextCreatedTo, page: 1 });
                  }}
                />
              </div>
              <div className="orders-filter-item">
                <span className="orders-filter-label">订单状态</span>
                <Select
                  allowClear
                  placeholder="全部订单"
                  value={status}
                  onChange={(nextStatus) => {
                    setStatus(nextStatus);
                    setPage(1);
                    updateOrderListUrl({ status: nextStatus, page: 1 });
                  }}
                  options={Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className="orders-filter-item">
                <span className="orders-filter-label">施工类型</span>
                <Select
                  allowClear
                  placeholder="全部类型"
                  value={constructionType}
                  onChange={(nextConstructionType) => {
                    setConstructionType(nextConstructionType);
                    setPage(1);
                    updateOrderListUrl({ constructionType: nextConstructionType, page: 1 });
                  }}
                  options={Object.entries(CONSTRUCTION_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className="orders-filter-item">
                <span className="orders-filter-label">支付状态</span>
                <Select
                  allowClear
                  placeholder="全部状态"
                  value={paymentStatus}
                  onChange={(nextPaymentStatus) => {
                    setPaymentStatus(nextPaymentStatus);
                    setPage(1);
                    updateOrderListUrl({ paymentStatus: nextPaymentStatus, page: 1 });
                  }}
                  options={Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <div className="orders-filter-item">
                <span className="orders-filter-label">筛选操作</span>
                <Button icon={<ReloadOutlined />} onClick={resetFilters}>
                  重置
                </Button>
              </div>
            </div>
          </section>

          <Card className="management-table-card">
            <div className="orders-mobile-cards">
              {rows.length > 0 ? (
                rows.map((row) => {
                  const payment = getPaymentStatus(row);
                  const progress = getConstructionProgress(row.status);

                  return (
                    <article key={row.id} className="orders-mobile-card">
                      <div className="orders-mobile-card-head">
                        <div className="min-w-0">
                          <Typography.Text strong className="orders-mobile-order-no">
                            {row.orderNo}
                          </Typography.Text>
                          <div className="orders-mobile-customer">{getOrderCustomerName(row)}</div>
                        </div>
                        <Tag>{getOrderStatusLabel(row.status)}</Tag>
                      </div>

                      <div className="orders-mobile-vehicle">{getOrderVehicleSummary(row)}</div>

                      <dl className="orders-mobile-fields">
                        <div>
                          <dt>施工类型</dt>
                          <dd>{getConstructionTypeLabel(row.constructionType)}</dd>
                        </div>
                        <div>
                          <dt>预约</dt>
                          <dd>{formatOrderListDate(row.appointmentDate ?? row.createdAt)} {row.appointmentTimeSlot ?? ""}</dd>
                        </div>
                        <div>
                          <dt>订单金额</dt>
                          <dd><strong>{yuanCurrency(row.amount?.totalAmountCents)}</strong></dd>
                        </div>
                        <div>
                          <dt>已收款</dt>
                          <dd>{yuanCurrency(row.amount?.paidAmountCents)}</dd>
                        </div>
                        <div>
                          <dt>支付状态</dt>
                          <dd><Tag color={payment.color}>{payment.label}</Tag></dd>
                        </div>
                        <div>
                          <dt>销售员</dt>
                          <dd>{row.salesPerson?.nickname ?? row.salesPerson?.username ?? "-"}</dd>
                        </div>
                      </dl>

                      <div className="orders-mobile-progress">
                        <div className="orders-progress-label">
                          <span>{progress.label}</span>
                          <span>{progress.percent}%</span>
                        </div>
                        <Progress percent={progress.percent} showInfo={false} size="small" status={progress.status} />
                      </div>

                      <div className="orders-mobile-actions">
                        <Button size="small" icon={<EyeOutlined />} onClick={() => router.push(`/orders/${row.id}`)}>
                          详情
                        </Button>
                        <Button size="small" icon={<CreditCardOutlined />} onClick={() => openOrderPaymentEntry(row)}>
                          收款
                        </Button>
                        <Button size="small" icon={<FileTextOutlined />} onClick={() => openOrderInvoiceEntry(row.id)}>
                          发票
                        </Button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="orders-mobile-empty">暂无订单数据</div>
              )}
            </div>
            <Table<OrderRow>
              className="orders-desktop-table"
              rowKey="id"
              loading={ordersQuery.isLoading}
              dataSource={rows}
              scroll={{ x: 1200 }}
              pagination={{
                current: page,
                pageSize,
                total: ordersQuery.data?.total ?? 0,
                showSizeChanger: true,
                onChange: (nextPage, nextPageSize) => {
                  setPage(nextPage);
                  setPageSize(nextPageSize);
                  updateOrderListUrl({ page: nextPage, pageSize: nextPageSize });
                }
              }}
              columns={[
            {
              title: "订单编号",
              dataIndex: "orderNo",
              width: 150,
              render: (orderNo: string) => <Typography.Text strong className="text-[var(--mb-primary)]">{orderNo}</Typography.Text>
            },
            {
              title: "客户",
              width: 140,
              render: (_, row) => row.customer?.companyName ?? row.customer?.name ?? "-"
            },
            {
              title: "车辆信息",
              width: 180,
              render: (_, row) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text>{row.vehicle?.carModel ?? "-"}</Typography.Text>
                  <Typography.Text type="secondary">
                    {[row.vehicle?.carPlate, row.vehicle?.carColor].filter(Boolean).join(" / ") || "-"}
                  </Typography.Text>
                </Space>
              )
            },
            {
              title: "施工/类型",
              width: 140,
              render: (_, row) => getConstructionTypeLabel(row.constructionType)
            },
            {
              title: "预约日期",
              width: 140,
              render: (_, row) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text>{formatOrderListDate(row.appointmentDate ?? row.createdAt)}</Typography.Text>
                  <Typography.Text type="secondary">{row.appointmentTimeSlot ?? "-"}</Typography.Text>
                </Space>
              )
            },
            {
              title: "金额/已收",
              width: 150,
              render: (_, row) => (
                <Space orientation="vertical" size={0}>
                  <Typography.Text strong className="text-[var(--mb-primary)]">
                    {yuanCurrency(row.amount?.totalAmountCents)}
                  </Typography.Text>
                  <Typography.Text type="secondary">已收 {yuanCurrency(row.amount?.paidAmountCents)}</Typography.Text>
                </Space>
              )
            },
            {
              title: "支付状态",
              width: 110,
              render: (_, row) => {
                const payment = getPaymentStatus(row);
                return <Tag color={payment.color}>{payment.label}</Tag>;
              }
            },
            {
              title: "施工进度",
              width: 150,
              render: (_, row) => {
                const progress = getConstructionProgress(row.status);
                return (
                  <Space className="w-full" orientation="vertical" size={2}>
                    <div className="orders-progress-label">
                      <span>{progress.label}</span>
                      <span>{progress.percent}%</span>
                    </div>
                    <Progress percent={progress.percent} showInfo={false} size="small" status={progress.status} />
                  </Space>
                );
              }
            },
            {
              title: "销售员",
              width: 110,
              render: (_, row) => row.salesPerson?.nickname ?? row.salesPerson?.username ?? "-"
            },
            {
              title: "状态",
              width: 100,
              render: (_, row) => <Tag>{getOrderStatusLabel(row.status)}</Tag>
            },
            {
              title: "操作",
              fixed: "right",
              width: 126,
              render: (_, row) => (
                <Space size={4}>
                  <Button
                    size="small"
                    type="text"
                    title="查看详情"
                    icon={<EyeOutlined />}
                    onClick={() => router.push(`/orders/${row.id}`)}
                  />
                  <Button
                    size="small"
                    type="text"
                    title="记录收款"
                    icon={<CreditCardOutlined />}
                    onClick={() => openOrderPaymentEntry(row)}
                  />
                  <Button
                    size="small"
                    type="text"
                    title="申请发票"
                    icon={<FileTextOutlined />}
                    onClick={() => openOrderInvoiceEntry(row.id)}
                  />
                </Space>
              )
            }
              ]}
            />
          </Card>
        </div>
      <OrderPaymentDrawer
        open={Boolean(paymentOrder)}
        order={paymentOrder}
        storeId={storeId}
        onClose={() => setPaymentOrder(null)}
        onSuccess={async () => {
          await ordersQuery.refetch();
        }}
      />
    </>
  );
}

function toOptionalParam(value: string | null) {
  return value || undefined;
}

function toPositiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatOrderListDate(value?: string | null) {
  if (!value) return "-";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "日期待确认";
}

function getOrderCustomerName(row: OrderRow) {
  return row.customer?.companyName ?? row.customer?.name ?? "-";
}

function getOrderVehicleSummary(row: OrderRow) {
  const plateAndColor = [row.vehicle?.carPlate, row.vehicle?.carColor].filter(Boolean).join(" / ");
  return [row.vehicle?.carModel, plateAndColor].filter(Boolean).join(" · ") || "-";
}

function getPaymentStatus(row: OrderRow) {
  const amount = row.amount;
  if (!amount || amount.paidAmountCents <= 0) {
    return { label: PAYMENT_STATUS_LABEL.UNPAID, color: "error" };
  }
  if (amount.outstandingCents <= 0) {
    return { label: PAYMENT_STATUS_LABEL.PAID, color: "success" };
  }
  return { label: PAYMENT_STATUS_LABEL.PARTIAL, color: "warning" };
}

function getConstructionProgress(status: string): {
  label: string;
  percent: number;
  status?: "normal" | "active" | "success" | "exception";
} {
  switch (status) {
    case "COMPLETED":
      return { label: "已完工", percent: 100, status: "success" };
    case "WARRANTIED":
      return { label: "已质保", percent: 100, status: "success" };
    case "IN_CONSTRUCTION":
      return { label: "施工中", percent: 65, status: "active" };
    case "DISPATCHED":
      return { label: "已派工", percent: 25, status: "active" };
    case "CANCELLED":
      return { label: "已取消", percent: 0, status: "exception" };
    default:
      return { label: "待派工", percent: 0, status: "normal" };
  }
}
