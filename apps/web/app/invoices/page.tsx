"use client";

import type { InvoiceSummary } from "@mallbay/shared";
import type { ApplyInvoicePayload } from "../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Select, Table, Tag } from "antd";
import { FileDoneOutlined, FileExclamationOutlined, FileSyncOutlined, SendOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { invoicesApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { formatCentsAsYuan, yuanToCents } from "../../src/features/finance/display";
import {
  getInvoiceBusinessLabel,
  getInvoiceFileDisplay,
  getInvoiceOrderLabel,
  getInvoiceStatusLabel
} from "../../src/features/invoices/display";

type ApplyInvoiceFormValues = Omit<ApplyInvoicePayload, "amountCents"> & {
  amountYuan: number;
};

type InvoiceOrderOption = {
  id: string;
  orderNo?: string | null;
  customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

export default function InvoicesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [applyForm] = Form.useForm<ApplyInvoiceFormValues>();
  const [issueForm] = Form.useForm<{ id: string; invoiceNo: string; fileUrl?: string; note?: string }>();
  const [voidForm] = Form.useForm<{ id: string; note?: string }>();
  const [sendForm] = Form.useForm<{ id: string; recipient: string; channel: string; note?: string }>();

  const invoicesQuery = useQuery({
    queryKey: ["invoices", storeId],
    queryFn: () => invoicesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const invoiceOrdersQuery = useQuery({
    queryKey: ["invoices", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const invoiceOrderOptions = ((invoiceOrdersQuery.data?.items ?? []) as InvoiceOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? order.id,
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const invoiceOptions = (invoicesQuery.data ?? []).map((invoice) => ({
    value: invoice.id,
    label: [getInvoiceBusinessLabel(invoice), getInvoiceStatusLabel(invoice.status)].filter(Boolean).join(" / ")
  }));
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoices", storeId] });

  const applyInvoice = useMutation({
    mutationFn: (values: ApplyInvoiceFormValues) =>
      invoicesApi.apply({
        orderId: values.orderId,
        title: values.title,
        taxNo: values.taxNo,
        amountCents: yuanToCents(values.amountYuan)
      }),
    onSuccess: async () => {
      message.success("发票申请已提交");
      applyForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const issueInvoice = useMutation({
    mutationFn: (values: { id: string; invoiceNo: string; fileUrl?: string; note?: string }) =>
      invoicesApi.issue(values.id, { invoiceNo: values.invoiceNo, fileUrl: values.fileUrl, note: values.note }),
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
    mutationFn: (values: { id: string; invoiceNo: string; fileUrl?: string; note?: string }) =>
      invoicesApi.reissue(values.id, { invoiceNo: values.invoiceNo, fileUrl: values.fileUrl, note: values.note }),
    onSuccess: async () => {
      message.success("发票已重开");
      issueForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const sendInvoice = useMutation({
    mutationFn: (values: { id: string; recipient: string; channel: string; note?: string }) =>
      invoicesApi.send(values.id, { recipient: values.recipient, channel: values.channel, note: values.note }),
    onSuccess: async () => {
      message.success("发票已发送");
      sendForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="发票管理" description="已完工且已收款订单的发票申请、开具、发送、作废和重开" />

        <Form form={applyForm} layout="inline" className="mb-4" onFinish={(values) => applyInvoice.mutate(values)}>
          <Form.Item name="orderId" rules={[{ required: true, message: "请选择可开票订单" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={invoiceOrdersQuery.isLoading}
              placeholder="选择可开票订单"
              options={invoiceOrderOptions}
              style={{ width: 300 }}
            />
          </Form.Item>
          <Form.Item name="title" rules={[{ required: true, message: "请输入发票抬头" }]}>
            <Input placeholder="发票抬头" />
          </Form.Item>
          <Form.Item name="taxNo">
            <Input placeholder="税号" />
          </Form.Item>
          <Form.Item name="amountYuan" rules={[{ required: true, message: "请输入金额" }]}>
            <InputNumber min={0.01} precision={2} placeholder="金额（元）" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<FileDoneOutlined />} loading={applyInvoice.isPending}>
            申请
          </Button>
        </Form>

        <Form form={issueForm} layout="inline" className="mb-4" onFinish={(values) => issueInvoice.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请选择发票" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={invoicesQuery.isLoading}
              placeholder="选择发票"
              options={invoiceOptions}
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item name="invoiceNo" rules={[{ required: true, message: "请输入发票号" }]}>
            <Input placeholder="发票号" />
          </Form.Item>
          <Form.Item name="fileUrl">
            <Input placeholder="电子文件 URL" />
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
          <Form.Item name="id" rules={[{ required: true, message: "请选择发票" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={invoicesQuery.isLoading}
              placeholder="选择发票"
              options={invoiceOptions}
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="作废原因" />
          </Form.Item>
          <Button htmlType="submit" danger loading={voidInvoice.isPending}>
            作废
          </Button>
        </Form>

        <Form form={sendForm} layout="inline" className="mb-4" onFinish={(values) => sendInvoice.mutate(values)}>
          <Form.Item name="id" rules={[{ required: true, message: "请选择发票" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              loading={invoicesQuery.isLoading}
              placeholder="选择发票"
              options={invoiceOptions}
              style={{ width: 260 }}
            />
          </Form.Item>
          <Form.Item name="recipient" rules={[{ required: true, message: "请输入接收人" }]}>
            <Input placeholder="接收人" />
          </Form.Item>
          <Form.Item name="channel" rules={[{ required: true, message: "请输入发送渠道" }]}>
            <Input placeholder="发送渠道" />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="发送备注" />
          </Form.Item>
          <Button htmlType="submit" icon={<SendOutlined />} loading={sendInvoice.isPending}>
            发送发票
          </Button>
        </Form>

        <Table<InvoiceSummary>
          rowKey="id"
          loading={invoicesQuery.isLoading}
          dataSource={invoicesQuery.data ?? []}
          columns={[
            { title: "发票", render: (_, row) => getInvoiceBusinessLabel(row) },
            { title: "订单", render: (_, row) => getInvoiceOrderLabel(row) },
            { title: "抬头", dataIndex: "title" },
            { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
            { title: "发票号", dataIndex: "invoiceNo" },
            { title: "状态", render: (_, row) => <Tag>{getInvoiceStatusLabel(row.status)}</Tag> },
            {
              title: "电子文件",
              render: (_, row) => {
                const file = getInvoiceFileDisplay(row.fileUrl);
                return file.available ? (
                  <a href={file.href} target="_blank" rel="noreferrer">
                    {file.label}
                  </a>
                ) : (
                  file.label
                );
              }
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
