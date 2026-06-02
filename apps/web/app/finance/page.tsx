"use client";

import type { ExpenseApplicationSummary, FinanceApprovalStatus } from "@mallbay/shared";
import type { CreateExpensePayload, CreateReimbursementPayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Table, Tabs, Tag, Typography } from "antd";
import { AuditOutlined, DollarOutlined, FileAddOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { financeApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

type PaymentRecordRow = {
  id: string;
  type: string;
  amountCents: number;
  referenceType?: string;
  referenceId?: string;
  createdAt?: string;
};

const REVIEW_OPTIONS: Array<{ value: FinanceApprovalStatus; label: string }> = [
  { value: "APPROVED", label: "通过" },
  { value: "REJECTED", label: "拒绝" },
  { value: "PAID", label: "已打款" }
];

export default function FinancePage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [expenseForm] = Form.useForm<CreateExpensePayload>();
  const [reimbursementForm] = Form.useForm<CreateReimbursementPayload>();
  const [reviewForm] = Form.useForm<{ id: string; status: FinanceApprovalStatus; note?: string }>();

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

  const invalidateFinance = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["finance-expenses", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-reimbursements", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["finance-payment-records", storeId] })
    ]);

  const createExpense = useMutation({
    mutationFn: (values: CreateExpensePayload) => financeApi.createExpense({ ...values, storeId: storeId! }),
    onSuccess: async () => {
      message.success("费用申请已提交");
      expenseForm.resetFields();
      await invalidateFinance();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const createReimbursement = useMutation({
    mutationFn: (values: CreateReimbursementPayload) => financeApi.createReimbursement({ ...values, storeId: storeId! }),
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
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">财务管理</Typography.Title>
          <Typography.Text type="secondary">费用申请、报销审批、打款记录和财务流水</Typography.Text>
        </div>

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
                    <Form.Item name="amountCents" rules={[{ required: true, message: "请输入金额" }]}>
                      <InputNumber min={1} placeholder="金额分" />
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
                    <Form.Item name="amountCents" rules={[{ required: true, message: "请输入金额" }]}>
                      <InputNumber min={1} placeholder="金额分" />
                    </Form.Item>
                    <Form.Item name="reason" rules={[{ required: true, message: "请输入事由" }]}>
                      <Input placeholder="事由" />
                    </Form.Item>
                    <Form.Item name="expenseId">
                      <Input placeholder="关联费用 ID" />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" icon={<DollarOutlined />} loading={createReimbursement.isPending}>
                      申请报销
                    </Button>
                  </Form>

                  <Form form={reviewForm} layout="inline" className="mb-4" onFinish={(values) => reviewReimbursement.mutate(values)}>
                    <Form.Item name="id" rules={[{ required: true, message: "请输入报销 ID" }]}>
                      <Input placeholder="报销 ID" />
                    </Form.Item>
                    <Form.Item name="status" rules={[{ required: true, message: "请选择结果" }]}>
                      <Select placeholder="审批结果" style={{ width: 140 }} options={REVIEW_OPTIONS} />
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
                    { title: "类型", dataIndex: "type" },
                    { title: "金额分", dataIndex: "amountCents" },
                    { title: "来源", dataIndex: "referenceType" },
                    { title: "来源 ID", dataIndex: "referenceId" },
                    { title: "时间", render: (_, row) => row.createdAt?.slice(0, 19).replace("T", " ") }
                  ]}
                />
              )
            }
          ]}
        />
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
        { title: "申请 ID", dataIndex: "id" },
        { title: "标题", dataIndex: "title" },
        { title: "金额分", dataIndex: "amountCents" },
        { title: "事由", dataIndex: "reason" },
        { title: "状态", render: (_, row) => <Tag>{row.status}</Tag> }
      ]}
    />
  );
}
