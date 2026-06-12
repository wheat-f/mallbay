"use client";

import type { ExpenseApplicationSummary, FinanceApprovalStatus } from "@mallbay/shared";
import type { CreateExpensePayload, CreateReimbursementPayload, OrderAuditEvent } from "../../src/lib/api";
import type { PaymentAccountOption } from "../../src/features/orders/api";
import { App, Button, Form, Input, InputNumber, Layout, Modal, Select, Table, Tabs, Tag } from "antd";
import { AuditOutlined, DollarOutlined, FileAddOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  FINANCE_REVIEW_OPTIONS,
  formatCentsAsYuan,
  getAuditActorLabel,
  getAuditReasonText,
  getFinanceApplicationLabel,
  getFinanceAuditActionLabel,
  getFinanceApprovalStatusLabel,
  getPaymentAccountTypeLabel,
  getPaymentRecordSourceLabel,
  getPaymentRecordTypeLabel,
  yuanToCents
} from "../../src/features/finance/display";
import { useState } from "react";

type PaymentRecordRow = {
  id: string;
  type: string;
  amountCents: number;
  sourceId?: string;
  referenceType?: string;
  referenceId?: string;
  note?: string;
  createdAt?: string;
};

type MoneyApplicationFormValues = Omit<CreateExpensePayload, "amountCents" | "storeId"> & {
  amountYuan: number;
  storeId?: string;
};

type MoneyReimbursementFormValues = Omit<CreateReimbursementPayload, "amountCents" | "storeId"> & {
  amountYuan: number;
  storeId?: string;
};

export default function FinancePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [expenseForm] = Form.useForm<MoneyApplicationFormValues>();
  const [reimbursementForm] = Form.useForm<MoneyReimbursementFormValues>();
  const [reviewForm] = Form.useForm<{ id: string; status: FinanceApprovalStatus; note?: string }>();
  const [selectedAccount, setSelectedAccount] = useState<PaymentAccountOption | null>(null);

  const expensesQuery = useQuery({
    queryKey: ["finance-expenses", storeId],
    queryFn: () => financeApi.expenses(storeId!),
    enabled: Boolean(storeId)
  });
  const reimbursementsQuery = useQuery({
    queryKey: ["finance-reimbursements", storeId],
    queryFn: () => financeApi.reimbursements(storeId!),
    enabled: Boolean(storeId)
  });
  const recordsQuery = useQuery({
    queryKey: ["finance-payment-records", storeId],
    queryFn: () => financeApi.paymentRecords(storeId!),
    enabled: Boolean(storeId)
  });
  const paymentAccountsQuery = useQuery({
    queryKey: ["finance-payment-accounts", storeId],
    queryFn: () => orderApi.paymentAccounts(storeId!),
    enabled: Boolean(storeId)
  });
  const accountAuditQuery = useQuery({
    queryKey: ["finance-payment-account-audit", selectedAccount?.id],
    queryFn: () => orderApi.paymentAccountAuditEvents(selectedAccount!.id),
    enabled: Boolean(selectedAccount?.id)
  });
  const expenseOptions = (expensesQuery.data ?? []).map((expense) => ({
    value: expense.id,
    label: getFinanceApplicationLabel(expense)
  }));
  const reimbursementOptions = (reimbursementsQuery.data ?? []).map((reimbursement) => ({
    value: reimbursement.id,
    label: getFinanceApplicationLabel(reimbursement)
  }));

  const invalidateFinance = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-expenses", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-reimbursements", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-payment-records", storeId] })
    ]);

  const createExpense = useMutation({
    mutationFn: (values: MoneyApplicationFormValues) =>
      financeApi.createExpense({
        storeId: storeId!,
        title: values.title,
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason
      }),
    onSuccess: async () => {
      message.success("费用申请已提交");
      expenseForm.resetFields();
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const createReimbursement = useMutation({
    mutationFn: (values: MoneyReimbursementFormValues) =>
      financeApi.createReimbursement({
        storeId: storeId!,
        title: values.title,
        amountCents: yuanToCents(values.amountYuan),
        reason: values.reason,
        expenseId: values.expenseId
      }),
    onSuccess: async () => {
      message.success("报销申请已提交");
      reimbursementForm.resetFields();
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const reviewReimbursement = useMutation({
    mutationFn: (values: { id: string; status: FinanceApprovalStatus; note?: string }) =>
      financeApi.reviewReimbursement(values.id, { status: values.status, note: values.note }),
    onSuccess: async () => {
      message.success("报销审批已更新");
      reviewForm.resetFields();
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="财务管理" description="费用申请、报销审批、打款记录和财务流水" />

        <Tabs
          items={[
            {
              key: "expenses",
              label: "费用申请",
              children: (
                <>
                  <Form form={expenseForm} layout="inline" className="mb-4" onFinish={(values) => createExpense.mutate(values)}>
                    <Form.Item name="title" rules={[{ required: true, message: "请输入费用标题" }]}>
                      <Input placeholder="费用标题" />
                    </Form.Item>
                    <Form.Item name="amountYuan" rules={[{ required: true, message: "请输入金额" }]}>
                      <InputNumber min={0.01} precision={2} placeholder="金额（元）" />
                    </Form.Item>
                    <Form.Item name="reason" rules={[{ required: true, message: "请输入用途" }]}>
                      <Input placeholder="用途" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<FileAddOutlined />} loading={createExpense.isPending}>
                      提交
                    </Button>
                  </Form>

                  <FinanceTable rows={expensesQuery.data ?? []} loading={expensesQuery.isLoading} />
                </>
              )
            },
            {
              key: "reimbursements",
              label: "报销审批",
              children: (
                <>
                  <Form
                    form={reimbursementForm}
                    layout="inline"
                    className="mb-4"
                    onFinish={(values) => createReimbursement.mutate(values)}
                  >
                    <Form.Item name="title" rules={[{ required: true, message: "请输入报销标题" }]}>
                      <Input placeholder="报销标题" />
                    </Form.Item>
                    <Form.Item name="amountYuan" rules={[{ required: true, message: "请输入金额" }]}>
                      <InputNumber min={0.01} precision={2} placeholder="金额（元）" />
                    </Form.Item>
                    <Form.Item name="reason" rules={[{ required: true, message: "请输入事由" }]}>
                      <Input placeholder="事由" />
                    </Form.Item>
                    <Form.Item name="expenseId">
                      <Select
                        allowClear
                        showSearch
                        optionFilterProp="label"
                        loading={expensesQuery.isLoading}
                        placeholder="选择关联费用"
                        options={expenseOptions}
                        style={{ width: 260 }}
                      />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<DollarOutlined />} loading={createReimbursement.isPending}>
                      申请报销
                    </Button>
                  </Form>

                  <Form form={reviewForm} layout="inline" className="mb-4" onFinish={(values) => reviewReimbursement.mutate(values)}>
                    <Form.Item
                      name="id"
                      rules={[{ required: true, message: "请选择报销申请" }]}
                    >
                      <Select
                        showSearch
                        optionFilterProp="label"
                        loading={reimbursementsQuery.isLoading}
                        placeholder="选择报销申请"
                        options={reimbursementOptions}
                        style={{ width: 260 }}
                      />
                    </Form.Item>
                    <Form.Item name="status" rules={[{ required: true, message: "请选择结果" }]}>
                      <Select placeholder="审批结果" style={{ width: 140 }} options={FINANCE_REVIEW_OPTIONS} />
                    </Form.Item>
                    <Form.Item name="note">
                      <Input placeholder="备注" />
                    </Form.Item>
                    <Button htmlType="submit" icon={<AuditOutlined />} loading={reviewReimbursement.isPending}>
                      审批
                    </Button>
                  </Form>

                  <FinanceTable rows={reimbursementsQuery.data ?? []} loading={reimbursementsQuery.isLoading} />
                </>
              )
            },
            {
              key: "records",
              label: "财务流水",
              children: (
                <Table<PaymentRecordRow>
                  rowKey="id"
                  loading={recordsQuery.isLoading}
                  dataSource={(recordsQuery.data ?? []) as PaymentRecordRow[]}
                  columns={[
                    { title: "类型", render: (_, row) => getPaymentRecordTypeLabel(row.type) },
                    { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
                    {
                      title: "来源",
                      render: (_, row) =>
                        getPaymentRecordSourceLabel(row, {
                          expenses: expensesQuery.data ?? [],
                          reimbursements: reimbursementsQuery.data ?? []
                        })
                    },
                    { title: "时间", render: (_, row) => row.createdAt?.slice(0, 19).replace("T", " ") }
                  ]}
                />
              )
            },
            {
              key: "accounts",
              label: "收款账户",
              children: (
                <Table<PaymentAccountOption>
                  rowKey="id"
                  loading={paymentAccountsQuery.isLoading}
                  dataSource={paymentAccountsQuery.data ?? []}
                  columns={[
                    { title: "账户名称", dataIndex: "name" },
                    { title: "类型", render: (_, row) => getPaymentAccountTypeLabel(row.type) },
                    { title: "开户行", dataIndex: "bankName" },
                    {
                      title: "账户",
                      render: (_, row) => maskAccountNo(row.accountNo)
                    },
                    {
                      title: "默认",
                      render: (_, row) => row.isDefault ? <Tag color="blue">默认</Tag> : "-"
                    },
                    {
                      title: "操作",
                      render: (_, row) => (
                        <Button size="small" onClick={() => setSelectedAccount(row)}>
                          审计
                        </Button>
                      )
                    }
                  ]}
                />
              )
            }
          ]}
        />

        <Modal
          title={selectedAccount ? `${selectedAccount.name} 审计记录` : "审计记录"}
          open={Boolean(selectedAccount)}
          onCancel={() => setSelectedAccount(null)}
          footer={null}
          destroyOnHidden
        >
          <Table<OrderAuditEvent>
            rowKey="id"
            size="small"
            loading={accountAuditQuery.isLoading}
            dataSource={accountAuditQuery.data ?? []}
            pagination={false}
            columns={[
              { title: "类型", render: (_, row) => getFinanceAuditActionLabel(row.action) },
              { title: "原因", render: (_, row) => getAuditReasonText(row.metadata) },
              { title: "操作人", render: (_, row) => getAuditActorLabel(row) },
              { title: "时间", render: (_, row) => formatDateTime(row.createdAt) }
            ]}
          />
        </Modal>
      </Layout.Content>
    </Layout>
  );
}

function FinanceTable({ rows, loading }: { rows: ExpenseApplicationSummary[]; loading: boolean }) {
  return (
    <Table<ExpenseApplicationSummary>
      rowKey="id"
      loading={loading}
      dataSource={rows}
      columns={[
        { title: "申请", render: (_, row) => getFinanceApplicationLabel(row) },
        { title: "标题", dataIndex: "title" },
        { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
        { title: "事由", dataIndex: "reason" },
        { title: "状态", render: (_, row) => <Tag>{getFinanceApprovalStatusLabel(row.status)}</Tag> }
      ]}
    />
  );
}

function maskAccountNo(value?: string | null) {
  if (!value) return "-";
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
