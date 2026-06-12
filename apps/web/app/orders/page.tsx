"use client";

import type { ConstructionType, OrderStatus } from "@mallbay/shared";
import { Button, DatePicker, Input, Layout, Select, Space, Table, Tag } from "antd";
import { PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import dayjs from "dayjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { orderApi } from "../../src/lib/api";
import type { OrderPaymentStatus } from "../../src/features/orders/api";
import {
  CONSTRUCTION_TYPE_LABEL,
  ORDER_STATUS_LABEL,
  getConstructionTypeLabel,
  getOrderStatusLabel,
  yuanCurrency
} from "../../src/features/orders/order-display";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";

type OrderRow = {
  id: string;
  orderNo: string;
  status: string;
  constructionType: string;
  customer?: { name?: string | null; companyName?: string | null };
  amount?: { totalAmountCents: number; paidAmountCents: number; outstandingCents: number } | null;
  createdAt: string;
};

const PAYMENT_STATUS_LABEL: Record<OrderPaymentStatus, string> = {
  UNPAID: "未收款",
  PARTIAL: "部分收款",
  PAID: "已收清"
};

export default function OrdersPage() {
  return (
    <Suspense fallback={<Layout className="dashboard-shell"><Layout.Content className="dashboard-content" /></Layout>}>
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const user = useAuthStore((state) => state.user);
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

  const rows = (ordersQuery.data?.items ?? []) as OrderRow[];

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="订单管理" description="查看销售订单、施工类型和收款进度">
          <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push("/orders/create")}>
            新建订单
          </Button>
        </StorePageHeader>

        <Space className="mb-4" wrap>
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
            style={{ width: 280 }}
          />
          <Select
            allowClear
            placeholder="订单状态"
            style={{ width: 180 }}
            value={status}
            onChange={(nextStatus) => {
              setStatus(nextStatus);
              setPage(1);
              updateOrderListUrl({ status: nextStatus, page: 1 });
            }}
            options={Object.entries(ORDER_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Select
            allowClear
            placeholder="施工类型"
            style={{ width: 180 }}
            value={constructionType}
            onChange={(nextConstructionType) => {
              setConstructionType(nextConstructionType);
              setPage(1);
              updateOrderListUrl({ constructionType: nextConstructionType, page: 1 });
            }}
            options={Object.entries(CONSTRUCTION_TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <Select
            allowClear
            placeholder="付款状态"
            style={{ width: 160 }}
            value={paymentStatus}
            onChange={(nextPaymentStatus) => {
              setPaymentStatus(nextPaymentStatus);
              setPage(1);
              updateOrderListUrl({ paymentStatus: nextPaymentStatus, page: 1 });
            }}
            options={Object.entries(PAYMENT_STATUS_LABEL).map(([value, label]) => ({ value, label }))}
          />
          <DatePicker
            format="YYYY-MM-DD"
            placeholder="开始日期"
            value={createdFrom ? dayjs(createdFrom) : undefined}
            onChange={(_, dateString) => {
              const nextCreatedFrom = typeof dateString === "string" ? dateString || undefined : undefined;
              setCreatedFrom(nextCreatedFrom);
              setPage(1);
              updateOrderListUrl({ createdFrom: nextCreatedFrom, page: 1 });
            }}
          />
          <DatePicker
            format="YYYY-MM-DD"
            placeholder="结束日期"
            value={createdTo ? dayjs(createdTo) : undefined}
            onChange={(_, dateString) => {
              const nextCreatedTo = typeof dateString === "string" ? dateString || undefined : undefined;
              setCreatedTo(nextCreatedTo);
              setPage(1);
              updateOrderListUrl({ createdTo: nextCreatedTo, page: 1 });
            }}
          />
        </Space>

        <Table<OrderRow>
          rowKey="id"
          loading={ordersQuery.isLoading}
          dataSource={rows}
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
            { title: "订单号", dataIndex: "orderNo" },
            {
              title: "客户",
              render: (_, row) => row.customer?.companyName ?? row.customer?.name ?? "-"
            },
            {
              title: "施工类型",
              render: (_, row) => getConstructionTypeLabel(row.constructionType)
            },
            {
              title: "状态",
              render: (_, row) => <Tag>{getOrderStatusLabel(row.status)}</Tag>
            },
            {
              title: "金额",
              render: (_, row) => yuanCurrency(row.amount?.totalAmountCents)
            },
            {
              title: "未收",
              render: (_, row) => yuanCurrency(row.amount?.outstandingCents)
            },
            {
              title: "创建时间",
              render: (_, row) => row.createdAt ? row.createdAt.slice(0, 10) : "-"
            },
            {
              title: "操作",
              render: (_, row) => (
                <Button size="small" onClick={() => router.push(`/orders/${row.id}`)}>
                  详情
                </Button>
              )
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}

function toOptionalParam(value: string | null) {
  return value || undefined;
}

function toPositiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
