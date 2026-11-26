"use client";

import { Alert, App, Button, Card, Form, Input, InputNumber, Modal } from "antd";
import { PlusOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { financeApi, type CreateExpensePayload } from "../../../src/features/finance/api";
import { FinanceApplicationTable } from "../../../src/features/finance/components/finance-application-table";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

const STATUS_TABS = [
  { key: "ALL", label: "全部" },
  { key: "PENDING", label: "待审批" },
  { key: "APPROVED", label: "已通过" },
  { key: "PAID", label: "已打款" },
  { key: "REJECTED", label: "已驳回" }
] as const;

export default function ExpenseListPage() {
  const storeId = useAuthStore((s) => s.user?.storeMember?.store.id);
  const permissionsQuery = useEffectivePermissions(storeId);
  const router = useRouter();
  const client = useQueryClient();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [keyword, setKeyword] = useState("");
  const [form] = Form.useForm();
  const scope = hasEffectivePermission(permissionsQuery.data?.permissions, "finance.expense", "review", storeId) ? "all" : "mine";
  const query = useQuery({
    queryKey: ["finance-expenses", storeId, scope],
    queryFn: () => financeApi.expenses({ storeId: storeId!, scope }),
    enabled: Boolean(storeId && hasEffectivePermission(permissionsQuery.data?.permissions, "finance", "read", storeId))
  });
  const create = useMutation({
    mutationFn: (values: Omit<CreateExpensePayload, "storeId" | "amountCents"> & { amountYuan: number }) =>
      financeApi.createExpense({ ...values, storeId: storeId!, amountCents: Math.round(values.amountYuan * 100) }),
    onSuccess: (item) => {
      message.success("费用申请已提交");
      setOpen(false);
      form.resetFields();
      void client.invalidateQueries({ queryKey: ["finance-expenses", storeId] });
      router.push(`/finance/expenses/${item.id}`);
    },
    onError: (error: unknown) => {
      message.error(error instanceof Error ? error.message : "提交费用申请失败，请稍后重试");
    }
  });

  const allRows = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const filteredRows = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    return allRows.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (kw && ![row.applicationNo, row.title, row.reason].filter(Boolean).join(" ").toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [allRows, statusFilter, keyword]);

  return (
    <div className="management-page">
      <StorePageHeader
        title="费用申请"
        description="查询门店费用申请并进入详情处理。"
        actions={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            新建费用申请
          </Button>
        }
      />
      {query.isError ? <Alert type="error" showIcon title="费用申请加载失败，请稍后刷新" /> : null}
      <Card className="management-table-card">
        <div className="management-table-toolbar finance-list-toolbar">
          <div className="mb-segmented-tabs" role="tablist" aria-label="费用状态筛选">
            {STATUS_TABS.map((tab) => (
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
              placeholder="搜索编号、标题或说明"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              style={{ width: 240 }}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => {
                setStatusFilter("ALL");
                setKeyword("");
              }}
            >
              重置
            </Button>
          </div>
        </div>
        <FinanceApplicationTable
          rows={filteredRows}
          loading={query.isLoading}
          onOpen={(id) => router.push(`/finance/expenses/${id}`)}
        />
      </Card>
      <Modal
        title="新建费用申请"
        open={open}
        onCancel={() => setOpen(false)}
        okText="提交申请"
        confirmLoading={create.isPending}
        onOk={() => form.submit()}
      >
        <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
          <Form.Item name="title" label="费用标题" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="amountYuan" label="费用金额（元）" rules={[{ required: true }]}>
            <InputNumber min={0.01} precision={2} style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="reason" label="用途说明" rules={[{ required: true }]}>
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
