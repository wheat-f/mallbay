"use client";

import type { InvoiceSummary } from "@mallbay/shared";
import type { ApplyInvoicePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Table, Tag, Typography } from "antd";
import { FileDoneOutlined, FileExclamationOutlined, FileSyncOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoicesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

export default function InvoicesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [applyForm] = Form.useForm<ApplyInvoicePayload>();
  const [issueForm] = Form.useForm<{ id: string; invoiceNo: string; note?: string }>();
  const [voidForm] = Form.useForm<{ id: string; note?: string }>();

  const invoicesQuery = useQuery({
    queryKey: ["invoices", storeId],
    queryFn: () => invoicesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoices", storeId] });

  const applyInvoice = useMutation({
    mutationFn: (values: ApplyInvoicePayload) => invoicesApi.apply(values),
    onSuccess: async () => {
      message.success("发票申请已提交");
      applyForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const issueInvoice = useMutation({
    mutationFn: (values: { id: string; invoiceNo: string; note?: string }) =>
      invoicesApi.issue(values.id, { invoiceNo: values.invoiceNo, note: values.note }),
    onSuccess: async () => {
      message.success("发票已开具");
      issueForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const voidInvoice = useMutation({
    mutationFn: (values: { id: string; note?: string }) => invoicesApi.void(values.id, values.note),
    onSuccess: async () => {
      message.success("发票已作废");
      voidForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const reissueInvoice = useMutation({
    mutationFn: (values: { id: string; invoiceNo: string; note?: string }) =>
      invoicesApi.reissue(values.id, { invoiceNo: values.invoiceNo, note: values.note }),
    onSuccess: async () => {
      message.success("发票已重开");
      issueForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4">
          <Typography.Title level={3} className="!mb-1">发票管理</Typography.Title>
          <Typography.Text type="secondary">已完工且已收款订单的发票申请、开具、作废和重开</Typography.Text>
        </div>

        <Form form={applyForm} layout="inline" className="mb-4" onFinish={(values) => applyInvoice.mutate(values)}>
          <Form.Item name="orderId" rules={[{ required: true, message: "请输入订单 ID" }]}>
            <Input placeholder="订单 ID" />
          </Form.Item>
          <Form.Item name="title" rules={[{ required: true, message: "请输入发票抬头" }]}>
            <Input placeholder="发票抬头" />
          </Form.Item>
          <Form.Item name="taxNo">
            <Input placeholder="税号" />
          </Form.Item>
          <Form.Item name="amountCents" rules={[{ required: true, message: "请输入金额" }]}>
            <InputNumber min={1} placeholder="金额分" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<FileDoneOutlined />} loading={applyInvoice.isPending}>
            申请
          </Button>
        </Form>

        <Form form={issueForm} layout="inline" className="mb-4" onFinish={(values) => issueInvoice.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请输入发票 ID" }]}>
            <Input placeholder="发票 ID" />
          </Form.Item>
          <Form.Item name="invoiceNo" rules={[{ required: true, message: "请输入发票号" }]}>
            <Input placeholder="发票号" />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="备注" />
          </Form.Item>
          <Button htmlType="submit" icon={<FileExclamationOutlined />} loading={issueInvoice.isPending}>
            开具
          </Button>
          <Button
            htmlType="button"
            icon={<FileSyncOutlined />}
            loading={reissueInvoice.isPending}
            onClick={async () => {
              const values = await issueForm.validateFields();
              reissueInvoice.mutate(values);
            }}
          >
            重开
          </Button>
        </Form>

        <Form form={voidForm} layout="inline" className="mb-4" onFinish={(values) => voidInvoice.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请输入发票 ID" }]}>
            <Input placeholder="发票 ID" />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="作废原因" />
          </Form.Item>
          <Button htmlType="submit" danger loading={voidInvoice.isPending}>
            作废
          </Button>
        </Form>

        <Table<InvoiceSummary>
          rowKey="id"
          loading={invoicesQuery.isLoading}
          dataSource={invoicesQuery.data ?? []}
          columns={[
            { title: "发票 ID", dataIndex: "id" },
            { title: "订单", dataIndex: "orderId" },
            { title: "抬头", dataIndex: "title" },
            { title: "金额分", dataIndex: "amountCents" },
            { title: "发票号", dataIndex: "invoiceNo" },
            { title: "状态", render: (_, row) => <Tag>{row.status}</Tag> }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
