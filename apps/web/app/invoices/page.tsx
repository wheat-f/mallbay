"use client";

import type { InvoiceSummary } from "@mallbay/shared";
import type { ApplyInvoicePayload } from "../../src/lib/api";
import { App, Button, Card, Drawer, Form, Input, InputNumber, Radio, Select, Table, Tag } from "antd";
import {
  DownloadOutlined,
  EyeOutlined,
  FileDoneOutlined,
  FileExclamationOutlined,
  FileSyncOutlined,
  PlusOutlined,
  SendOutlined
} from "@ant-design/icons";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { invoicesApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { formatCentsAsYuan, yuanToCents } from "../../src/features/finance/display";
import {
  getInvoiceBusinessLabel,
  getInvoiceFileDisplay,
  getInvoiceOrderPaymentStatus,
  getInvoiceOrderLabel,
  getInvoiceStatusLabel
} from "../../src/features/invoices/display";

type ApplyInvoiceFormValues = Omit<ApplyInvoicePayload, "amountCents"> & {
  amountYuan: number;
  invoiceType?: "SPECIAL" | "NORMAL";
  recipientName?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  mailingAddress?: string;
  applicationNote?: string;
};

type InvoiceProcessValues = {
  id: string;
  invoiceNo?: string;
  fileUrl?: string;
  note?: string;
  recipient?: string;
  channel?: string;
};

type InvoiceOrderOption = {
  id: string;
  orderNo?: string | null;
  customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

export default function InvoicesPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [applyForm] = Form.useForm<ApplyInvoiceFormValues>();
  const [invoiceProcessForm] = Form.useForm<InvoiceProcessValues>();
  const sendForm = invoiceProcessForm;
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orderStatusFilter, setOrderStatusFilter] = useState<string>("ALL");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("ALL");
  const [applicationDrawerOpen, setApplicationDrawerOpen] = useState(false);
  const invoiceActionParam = searchParams.get("action");
  const requestedInvoiceOrderId = searchParams.get("orderId");

  const invoicesQuery = useQuery({
    queryKey: ["invoices", storeId],
    queryFn: () => invoicesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const invoiceOrdersQuery = useQuery({
    queryKey: ["invoices", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", paymentStatus: "PAID", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });

  const invoiceOrderOptions = ((invoiceOrdersQuery.data?.items ?? []) as InvoiceOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? "未编号订单",
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  if (requestedInvoiceOrderId && !invoiceOrderOptions.some((option) => option.value === requestedInvoiceOrderId)) {
    invoiceOrderOptions.push({
      value: requestedInvoiceOrderId,
      label: `当前订单 ${requestedInvoiceOrderId}`
    });
  }
  const invoiceRows = useMemo(() => invoicesQuery.data ?? [], [invoicesQuery.data]);
  const invoiceOptions = invoiceRows.map((invoice) => ({
    value: invoice.id,
    label: [getInvoiceBusinessLabel(invoice), getInvoiceStatusLabel(invoice.status)].filter(Boolean).join(" / ")
  }));
  const activeInvoiceId = selectedInvoiceId ?? invoiceRows[0]?.id;
  const selectedInvoice = useMemo(
    () => invoiceRows.find((invoice) => invoice.id === activeInvoiceId),
    [activeInvoiceId, invoiceRows]
  );
  const filteredInvoiceRows = invoiceRows.filter((invoice) => {
    const matchesInvoiceStatus = statusFilter === "ALL" || invoice.status === statusFilter;
    const matchesOrderStatus = orderStatusFilter === "ALL" || invoice.order?.status === orderStatusFilter;
    const matchesPaymentStatus = paymentStatusFilter === "ALL" || getInvoiceOrderPaymentStatus(invoice) === paymentStatusFilter;
    return matchesInvoiceStatus && matchesOrderStatus && matchesPaymentStatus;
  });
  const invoiceSummary = {
    total: invoiceRows.length,
    applied: invoiceRows.filter((invoice) => invoice.status === "APPLIED").length,
    issued: invoiceRows.filter((invoice) => invoice.status === "ISSUED").length,
    voided: invoiceRows.filter((invoice) => invoice.status === "VOIDED").length,
    pendingAmountCents: invoiceRows
      .filter((invoice) => invoice.status === "APPLIED")
      .reduce((total, invoice) => total + invoice.amountCents, 0),
    issuedAmountCents: invoiceRows
      .filter((invoice) => invoice.status === "ISSUED" || invoice.status === "REISSUED")
      .reduce((total, invoice) => total + invoice.amountCents, 0)
  };
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["invoices", storeId] });

  useEffect(() => {
    sendForm.resetFields();
    if (selectedInvoice) {
      sendForm.setFieldsValue({
        id: selectedInvoice.id,
        invoiceNo: selectedInvoice.invoiceNo ?? undefined,
        fileUrl: selectedInvoice.fileUrl ?? undefined
      });
    }
  }, [selectedInvoice, sendForm]);

  useEffect(() => {
    if (invoiceActionParam !== "create-invoice") return;
    setApplicationDrawerOpen(true);
    if (requestedInvoiceOrderId) {
      applyForm.setFieldsValue({ orderId: requestedInvoiceOrderId });
    }
  }, [applyForm, invoiceActionParam, requestedInvoiceOrderId]);

  const applyInvoice = useMutation({
    mutationFn: (values: ApplyInvoiceFormValues) =>
      invoicesApi.apply({
        orderId: values.orderId,
        title: values.title,
        taxNo: values.taxNo,
        amountCents: yuanToCents(values.amountYuan)
      }),
    onSuccess: async (created) => {
      message.success("发票申请已提交");
      applyForm.resetFields();
      setApplicationDrawerOpen(false);
      setSelectedInvoiceId(created.id);
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const issueInvoice = useMutation({
    mutationFn: (values: InvoiceProcessValues) =>
      invoicesApi.issue(values.id, { invoiceNo: values.invoiceNo!, fileUrl: values.fileUrl, note: values.note }),
    onSuccess: async () => {
      message.success("发票已开票");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const voidInvoice = useMutation({
    mutationFn: (values: InvoiceProcessValues) => invoicesApi.void(values.id, values.note),
    onSuccess: async () => {
      message.success("发票已作废");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const reissueInvoice = useMutation({
    mutationFn: (values: InvoiceProcessValues) =>
      invoicesApi.reissue(values.id, { invoiceNo: values.invoiceNo!, fileUrl: values.fileUrl, note: values.note }),
    onSuccess: async () => {
      message.success("重新开票已完成");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const sendInvoice = useMutation({
    mutationFn: (values: InvoiceProcessValues) =>
      invoicesApi.send(values.id, { recipient: values.recipient!, channel: values.channel!, note: values.note }),
    onSuccess: async () => {
      message.success("发票已发送");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleIssue = async () => {
    const values = await sendForm.validateFields(["id", "invoiceNo", "fileUrl", "note"]);
    issueInvoice.mutate(values as InvoiceProcessValues);
  };
  const handleReissue = async () => {
    const values = await sendForm.validateFields(["id", "invoiceNo", "fileUrl", "note"]);
    reissueInvoice.mutate(values as InvoiceProcessValues);
  };
  const handleVoid = async () => {
    const values = await sendForm.validateFields(["id", "note"]);
    voidInvoice.mutate(values as InvoiceProcessValues);
  };
  const handleSend = async () => {
    const values = await sendForm.validateFields(["id", "recipient", "channel", "note"]);
    sendInvoice.mutate(values as InvoiceProcessValues);
  };

  return (
    <div className="management-page">
      <StorePageHeader title="发票管理" description="管理客户发票申请，处理开票、发送、作废和重开流程">
        <Button icon={<DownloadOutlined />}>导出报表</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setApplicationDrawerOpen(true)}>
          新增开票申请
        </Button>
      </StorePageHeader>

      <div className="invoice-metric-grid">
        {[
          ["待开票金额", formatCentsAsYuan(invoiceSummary.pendingAmountCents), `${invoiceSummary.applied} 笔待财务开票`],
          ["已开票总额", formatCentsAsYuan(invoiceSummary.issuedAmountCents), "本店已完成开票金额"],
          ["本月申请数", `${invoiceSummary.total} 笔`, `${invoiceSummary.voided} 笔作废或需重开`]
        ].map(([label, value, description]) => (
          <Card key={label} className="invoice-metric-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </div>

      <Card className="invoice-filter-panel management-filter-card">
        <div className="invoice-filter-row">
          <span>订单状态</span>
          <Select
            value={orderStatusFilter}
            onChange={setOrderStatusFilter}
            options={[
              { value: "ALL", label: "全部" },
              { value: "COMPLETED", label: "已完成" },
              { value: "WARRANTIED", label: "已质保" }
            ]}
          />
          <span>收款状态</span>
          <Select
            value={paymentStatusFilter}
            onChange={setPaymentStatusFilter}
            options={[
              { value: "ALL", label: "全部" },
              { value: "UNPAID", label: "未收款" },
              { value: "PARTIAL", label: "部分到款" },
              { value: "PAID", label: "已到款" }
            ]}
          />
          <span>发票状态</span>
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: "全部" },
              { value: "APPLIED", label: "未开票 / 待开票" },
              { value: "ISSUED", label: "已开票" },
              { value: "VOIDED", label: "已作废" },
              { value: "REISSUED", label: "已开票" }
            ]}
          />
          <Button
            onClick={() => {
              setOrderStatusFilter("ALL");
              setPaymentStatusFilter("ALL");
              setStatusFilter("ALL");
            }}
          >
            清除过滤
          </Button>
        </div>
      </Card>

      <section className="invoice-workspace">
        <Card className="invoice-record-list" title="发票列表">
          <div className="invoice-mobile-cards">
            {filteredInvoiceRows.length > 0 ? (
              filteredInvoiceRows.map((invoice) => {
                const file = getInvoiceFileDisplay(invoice.fileUrl);

                return (
                  <article
                    key={invoice.id}
                    className={`invoice-mobile-card${invoice.id === selectedInvoice?.id ? " is-selected" : ""}`}
                    onClick={() => setSelectedInvoiceId(invoice.id)}
                  >
                    <div className="invoice-mobile-card-head">
                      <div>
                        <strong>{getInvoiceBusinessLabel(invoice)}</strong>
                        <span>{getInvoiceOrderLabel(invoice)}</span>
                      </div>
                      <Tag>{getInvoiceStatusLabel(invoice.status)}</Tag>
                    </div>
                    <dl className="invoice-mobile-card-fields">
                      <div>
                        <dt>抬头</dt>
                        <dd>{invoice.title}</dd>
                      </div>
                      <div>
                        <dt>金额</dt>
                        <dd>{formatCentsAsYuan(invoice.amountCents)}</dd>
                      </div>
                      <div>
                        <dt>发票号</dt>
                        <dd>{invoice.invoiceNo ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>电子文件</dt>
                        <dd>
                          {file.available ? (
                            <a href={file.href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                              {file.label}
                            </a>
                          ) : (
                            file.label
                          )}
                        </dd>
                      </div>
                    </dl>
                    <div className="invoice-mobile-card-actions">
                      <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={(event) => {
                          event.stopPropagation();
                          router.push(`/invoices/${invoice.id}`);
                        }}
                      >
                        查看详情
                      </Button>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="invoice-mobile-empty">暂无发票列表数据</div>
            )}
          </div>

          <Table<InvoiceSummary>
            className="invoice-desktop-table"
            rowKey="id"
            loading={invoicesQuery.isLoading}
            dataSource={filteredInvoiceRows}
            pagination={{ pageSize: 8 }}
            onRow={(row) => ({
              onClick: () => setSelectedInvoiceId(row.id)
            })}
            rowClassName={(row) => (row.id === selectedInvoice?.id ? "invoice-selected-row" : "")}
            columns={[
              { title: "发票", render: (_, row) => getInvoiceBusinessLabel(row) },
              { title: "订单", render: (_, row) => getInvoiceOrderLabel(row) },
              { title: "抬头", dataIndex: "title" },
              { title: "金额", render: (_, row) => formatCentsAsYuan(row.amountCents) },
              { title: "发票号", render: (_, row) => row.invoiceNo ?? "-" },
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
              },
              {
                title: "操作",
                render: (_, row) => (
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/invoices/${row.id}`);
                    }}
                  >
                    查看详情
                  </Button>
                )
              }
            ]}
          />
        </Card>

        <Card className="invoice-process-panel">
          <div className="invoice-process-head">
            <div>
              <h2>开票处理</h2>
              <p>
                {selectedInvoice
                  ? `${getInvoiceBusinessLabel(selectedInvoice)}`
                  : "选择左侧发票申请后进行开票、发送、作废或重开"}
              </p>
            </div>
            <Tag color={selectedInvoice?.status === "ISSUED" || selectedInvoice?.status === "REISSUED" ? "success" : "processing"}>
              {getInvoiceStatusLabel(selectedInvoice?.status)}
            </Tag>
          </div>

          <div className="invoice-summary-box">
            <div>
              <span>关联订单</span>
              <strong>{selectedInvoice ? getInvoiceOrderLabel(selectedInvoice) : "-"}</strong>
            </div>
            <div>
              <span>开票金额</span>
              <strong>{selectedInvoice ? formatCentsAsYuan(selectedInvoice.amountCents) : "-"}</strong>
            </div>
          </div>

          <Form form={sendForm} layout="vertical" className="invoice-process-form">
            <Form.Item name="id" label="发票" rules={[{ required: true, message: "请选择发票" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={invoicesQuery.isLoading}
                placeholder="选择发票"
                options={invoiceOptions}
                onChange={(value) => setSelectedInvoiceId(value)}
              />
            </Form.Item>

            <div className="invoice-issue-card">
              <h3>开具 / 重开发票</h3>
              <Form.Item name="invoiceNo" label="发票号" rules={[{ required: true, message: "请输入发票号" }]}>
                <Input placeholder="发票号" />
              </Form.Item>
              <Form.Item name="fileUrl" label="电子发票文件链接">
                <Input placeholder="粘贴电子发票文件链接" />
              </Form.Item>
            </div>

            <div className="invoice-send-card">
              <h3>发送电子发票</h3>
              <Form.Item name="recipient" label="接收人" rules={[{ required: true, message: "请输入接收人" }]}>
                <Input placeholder="接收人邮箱、手机号或企业联系人" />
              </Form.Item>
              <Form.Item name="channel" label="发送渠道" rules={[{ required: true, message: "请输入发送渠道" }]}>
                <Input placeholder="EMAIL / WECHAT / SMS" />
              </Form.Item>
            </div>

            <Form.Item name="note" label="作废原因 / 操作备注">
              <Input.TextArea rows={3} placeholder="作废原因、重开原因或发送备注" />
            </Form.Item>

            <div className="invoice-process-actions">
              <Button
                icon={<FileExclamationOutlined />}
                loading={issueInvoice.isPending}
                disabled={!selectedInvoice}
                onClick={handleIssue}
              >
                开具
              </Button>
              <Button
                icon={<FileSyncOutlined />}
                loading={reissueInvoice.isPending}
                disabled={!selectedInvoice}
                onClick={handleReissue}
              >
                重开发票
              </Button>
              <Button danger loading={voidInvoice.isPending} disabled={!selectedInvoice} onClick={handleVoid}>
                作废
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                title="发送发票"
                loading={sendInvoice.isPending}
                disabled={!selectedInvoice}
                onClick={handleSend}
              >
                发送电子发票
              </Button>
            </div>
          </Form>
        </Card>
      </section>

      <Drawer
        title="发票申请"
        placement="right"
        open={applicationDrawerOpen}
        rootClassName="invoice-application-drawer"
        onClose={() => setApplicationDrawerOpen(false)}
        footer={
          <div className="invoice-drawer-footer">
            <Button onClick={() => setApplicationDrawerOpen(false)}>取消</Button>
            <Button type="primary" icon={<FileDoneOutlined />} loading={applyInvoice.isPending} onClick={() => applyForm.submit()}>
              提交开票申请
            </Button>
          </div>
        }
      >
        <div className="invoice-drawer-order-note">
          <strong>关联订单</strong>
          <span>选择已完成且可开票订单，系统将保留订单与发票的追溯关系。</span>
        </div>
        <Form
          form={applyForm}
          layout="vertical"
          className="invoice-apply-form invoice-drawer-form"
          initialValues={{ invoiceType: "SPECIAL" }}
          onFinish={(values) => applyInvoice.mutate(values)}
        >
          <section className="invoice-drawer-section">
            <h3>抬头信息</h3>
            <Form.Item name="invoiceType" label="发票类型" rules={[{ required: true, message: "请选择发票类型" }]}>
              <Radio.Group
                options={[
                  { value: "SPECIAL", label: "增值税专用发票" },
                  { value: "NORMAL", label: "增值税普通发票" }
                ]}
              />
            </Form.Item>
            <Form.Item name="orderId" label="可开票订单" rules={[{ required: true, message: "请选择可开票订单" }]}>
              <Select
                showSearch
                optionFilterProp="label"
                loading={invoiceOrdersQuery.isLoading}
                placeholder="选择可开票订单"
                options={invoiceOrderOptions}
              />
            </Form.Item>
            <Form.Item name="title" label="发票抬头" rules={[{ required: true, message: "请输入发票抬头" }]}>
              <Input placeholder="客户公司或个人抬头" />
            </Form.Item>
            <Form.Item name="taxNo" label="统一社会信用代码 / 税号">
              <Input placeholder="企业税号，个人发票可留空" />
            </Form.Item>
            <Form.Item name="amountYuan" label="金额（元）" rules={[{ required: true, message: "请输入金额" }]}>
              <InputNumber className="w-full" min={0.01} precision={2} placeholder="金额（元）" />
            </Form.Item>
          </section>

          <section className="invoice-drawer-section">
            <h3>收票信息</h3>
            <div className="invoice-recipient-grid">
              <Form.Item name="recipientName" label="收票人">
                <Input placeholder="请输入收票人" />
              </Form.Item>
              <Form.Item name="recipientPhone" label="联系电话">
                <Input placeholder="请输入联系电话" />
              </Form.Item>
            </div>
            <Form.Item name="recipientEmail" label="接收邮箱 (电子发票必填)">
              <Input placeholder="finance@example.com" />
            </Form.Item>
            <Form.Item name="mailingAddress" label="邮寄地址 (纸质发票必填)">
              <Input placeholder="填写纸质发票邮寄地址" />
            </Form.Item>
            <Form.Item name="applicationNote" label="备注">
              <Input.TextArea rows={3} placeholder="填写开票、寄送或客户要求备注" />
            </Form.Item>
          </section>
        </Form>
      </Drawer>
    </div>
  );
}
