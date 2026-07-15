"use client";

import { Card, DatePicker, Select, Space, Table, Tag } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { PaymentDirection, PaymentRecordType } from "@mallbay/shared";
import { financeApi } from "../../../src/features/finance/api";
import {
  formatCentsAsYuan,
  getPaymentDirectionLabel,
  getPaymentRecordTypeLabel,
} from "../../../src/features/finance/display";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { orderApi } from "../../../src/features/orders/api";

type LedgerFilters = {
  direction?: PaymentDirection;
  type?: PaymentRecordType;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export default function FinanceLedgerPage() {
  const storeId = useAuthStore((s) => s.user?.storeMember?.store.id);
  const [filters, setFilters] = useState<LedgerFilters>({});
  const accounts = useQuery({
    queryKey: ["finance-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId),
  });
  const query = useQuery({
    queryKey: ["finance-ledger", storeId, filters],
    queryFn: () =>
      financeApi.paymentRecords({
        storeId: storeId!,
        scope: "all",
        ...filters,
      }),
    enabled: Boolean(storeId),
  });

  return (
    <div className="management-page">
      <StorePageHeader
        title="财务流水"
        description="按收入、支出和日期查询已入账的资金变化。"
      />
      <Card>
        <Space wrap>
          <Select<PaymentDirection>
            placeholder="收支方向"
            allowClear
            value={filters.direction}
            onChange={(direction) =>
              setFilters((current) => ({ ...current, direction }))
            }
            options={[
              { value: "INCOME", label: "收入" },
              { value: "EXPENSE", label: "支出" },
            ]}
          />
          <Select<PaymentRecordType>
            placeholder="流水类型"
            allowClear
            value={filters.type}
            onChange={(type) => setFilters((current) => ({ ...current, type }))}
            options={[
              { value: "REIMBURSEMENT", label: "报销" },
              { value: "SALE", label: "销售收款" },
              { value: "PURCHASE", label: "采购付款" },
              { value: "OTHER", label: "其他" },
            ]}
          />
          <Select
            placeholder="资金账户"
            allowClear
            value={filters.accountId}
            onChange={(accountId) =>
              setFilters((current) => ({ ...current, accountId }))
            }
            options={(accounts.data ?? []).map((account) => ({
              value: account.id,
              label: account.name,
            }))}
          />
          <DatePicker
            placeholder="开始日期"
            onChange={(date) =>
              setFilters((current) => ({
                ...current,
                dateFrom: date?.format("YYYY-MM-DD"),
              }))
            }
          />
          <DatePicker
            placeholder="结束日期"
            onChange={(date) =>
              setFilters((current) => ({
                ...current,
                dateTo: date?.format("YYYY-MM-DD"),
              }))
            }
          />
        </Space>
        <Table
          style={{ marginTop: 20 }}
          rowKey="id"
          loading={query.isLoading}
          dataSource={query.data?.items ?? []}
          columns={[
            {
              title: "发生时间",
              dataIndex: "occurredAt",
              render: (value) => new Date(value).toLocaleString("zh-CN"),
            },
            {
              title: "类型",
              dataIndex: "type",
              render: (value) => getPaymentRecordTypeLabel(value),
            },
            {
              title: "方向",
              dataIndex: "direction",
              render: (value) => (
                <Tag color={value === "INCOME" ? "success" : "error"}>
                  {getPaymentDirectionLabel(value)}
                </Tag>
              ),
            },
            {
              title: "金额",
              dataIndex: "amountCents",
              render: (value, row) => (
                <span
                  className={
                    row.direction === "INCOME"
                      ? "finance-income"
                      : "finance-expense"
                  }
                >
                  {formatCentsAsYuan(value)}
                </span>
              ),
            },
            {
              title: "备注",
              dataIndex: "note",
              render: (value) => value || "-",
            },
          ]}
          pagination={false}
        />
      </Card>
    </div>
  );
}
