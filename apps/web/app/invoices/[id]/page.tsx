"use client";

import type { InvoiceStatus, InvoiceSummary } from "@mallbay/shared";
import { Button, Card, Empty, Input, Modal, Skeleton, Tag } from "antd";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  HistoryOutlined,
  LinkOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "../../../src/lib/api";
import { formatCentsAsYuan } from "../../../src/features/finance/display";
import {
  getInvoiceBusinessLabel,
  getInvoiceFileDisplay,
  getInvoiceOrderLabel,
  getInvoiceStatusLabel
} from "../../../src/features/invoices/display";
import { useAuthStore } from "../../../src/stores/auth-store";

type InvoiceTimelineItem = {
  status: InvoiceStatus | "DRAFT" | "SENT";
  title: string;
  description: string;
};

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const invoiceId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  const invoicesQuery = useQuery({
    queryKey: ["invoices", storeId],
    queryFn: () => invoicesApi.list(storeId!),
    enabled: Boolean(storeId)
  });

  const invoice = useMemo(
    () => invoicesQuery.data?.find((item) => item.id === invoiceId),
    [invoiceId, invoicesQuery.data]
  );
  const fileDisplay = getInvoiceFileDisplay(invoice?.fileUrl);
  const timeline = getInvoiceDetailTimeline(invoice);

  return (
    <div className="management-page invoice-detail-page">
      <section className="invoice-detail-hero">
        <div>
          <div className="invoice-detail-breadcrumb">
            <span>发票管理</span>
            <span>/</span>
            <span>{invoice ? getInvoiceBusinessLabel(invoice) : "发票详情"}</span>
          </div>
          <div className="invoice-detail-title-row">
            <h1>发票详情</h1>
            {invoice ? <Tag color={getInvoiceStatusColor(invoice.status)}>{getInvoiceStatusLabel(invoice.status)}</Tag> : null}
          </div>
          <p>查看发票基础信息、关联订单、明细项目、状态变迁历史与内部备注。</p>
        </div>
        <div className="invoice-detail-actions">
          <Link href="/invoices">
            <Button icon={<ArrowLeftOutlined />}>返回发票列表</Button>
          </Link>
          <Button icon={<HistoryOutlined />} onClick={() => setIsLogModalOpen(true)}>
            查看操作日志
          </Button>
          <Button icon={<ReloadOutlined />}>重新开具</Button>
          <Button danger icon={<CloseCircleOutlined />}>
            废弃/取消发票
          </Button>
        </div>
      </section>

      {invoicesQuery.isLoading ? (
        <Card className="invoice-detail-loading">
          <Skeleton active paragraph={{ rows: 8 }} />
        </Card>
      ) : !invoice ? (
        <Card className="invoice-detail-empty">
          <Empty description="未找到该发票，或当前账号无权查看该门店发票" />
        </Card>
      ) : (
        <section className="invoice-detail-grid">
          <div className="invoice-detail-main">
            <Card className="invoice-detail-section">
              <div className="invoice-detail-section-head">
                <div>
                  <span>基本信息</span>
                  <h2>{getInvoiceBusinessLabel(invoice)}</h2>
                </div>
                <div className="invoice-detail-section-meta">
                  <Tag color={getInvoiceStatusColor(invoice.status)}>{getInvoiceStatusLabel(invoice.status)}</Tag>
                  <span>创建时间: {formatInvoiceDetailDate(invoice.createdAt)}</span>
                </div>
              </div>

              <div className="invoice-detail-info-grid">
                <InfoItem label="发票抬头" value={invoice.title} />
                <InfoItem label="纳税人识别号" value={getInvoiceTaxNoDisplay(invoice)} />
                <InfoItem label="发票类型" value="增值税专用发票 (电子版)" />
                <InfoItem label="发票号码" value={invoice.invoiceNo ?? "待开具"} />
                <InfoItem label="发票金额" value={formatCentsAsYuan(invoice.amountCents)} strong />
                <InfoItem label="注册地址与电话" value={getInvoiceBillingContactDisplay(invoice)} wide />
                <InfoItem label="电子文件" value={fileDisplay.label} href={fileDisplay.href} />
              </div>
            </Card>

            <Card className="invoice-detail-section">
              <div className="invoice-detail-section-title">
                <LinkOutlined />
                <span>关联订单</span>
              </div>
              <div className="invoice-detail-order-card">
                <div>
                  <span>订单信息</span>
                  <strong>{getInvoiceOrderLabel(invoice)}</strong>
                </div>
                <Link href={`/orders/${invoice.orderId}`}>查看订单详情</Link>
              </div>
            </Card>

            <Card className="invoice-detail-section invoice-detail-line-items">
              <div className="invoice-detail-section-title">
                <FileSearchOutlined />
                <span>发票明细项目</span>
              </div>
              <div className="invoice-detail-line-head">
                <span>项目名称</span>
                <span>规格/型号</span>
                <span>数量</span>
                <span>单价</span>
                <span>小计</span>
              </div>
              <div className="invoice-detail-line-row">
                <div>
                  <strong>漆面保护膜施工服务</strong>
                  <p>{getInvoiceOrderLabel(invoice)}</p>
                </div>
                <span>订单开票</span>
                <span>1</span>
                <span>{formatCentsAsYuan(invoice.amountCents)}</span>
                <strong>{formatCentsAsYuan(invoice.amountCents)}</strong>
              </div>
              <div className="invoice-detail-line-total">
                <span>总计金额</span>
                <strong>{formatCentsAsYuan(invoice.amountCents)}</strong>
              </div>
            </Card>
          </div>

          <aside className="invoice-detail-side">
            <Card className="invoice-detail-status-card">
              <div className="invoice-detail-section-title">
                <ClockCircleOutlined />
                <span>状态变迁历史</span>
              </div>
              <div className="invoice-detail-timeline">
                {timeline.map((item) => (
                  <div key={`${item.status}-${item.title}`} className="invoice-detail-timeline-item">
                    <span className={`invoice-detail-timeline-dot is-${item.status.toLowerCase()}`} />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="invoice-detail-note-card">
              <div className="invoice-detail-section-title">
                <FileDoneOutlined />
                <span>内部备注</span>
              </div>
              <p>
                该发票对应高端保时捷车主，请确保开票信息准确无误。如需废弃重开，必须先收回原纸质质保卡或作废记录。
              </p>
              <div className="invoice-detail-note-editor">
                <Input.TextArea rows={3} placeholder="添加新备注..." />
                <Button type="primary" block>
                  添加备注
                </Button>
              </div>
            </Card>

            <Card className="invoice-detail-total-card">
              <span>累计开票总额 (本月)</span>
              <strong>{formatCentsAsYuan(invoice.amountCents)}</strong>
              <p>已纳入本店发票流水与报表分析统计。</p>
            </Card>
          </aside>
        </section>
      )}

      <Modal
        className="invoice-detail-log-modal"
        title="操作日志流水"
        open={isLogModalOpen}
        onCancel={() => setIsLogModalOpen(false)}
        footer={
          <Button type="primary" onClick={() => setIsLogModalOpen(false)}>
            确定
          </Button>
        }
      >
        <div className="invoice-detail-log-list">
          {getInvoiceOperationLogs(invoice).map((item) => (
            <div key={item.title} className={`invoice-detail-log-item is-${item.tone}`}>
              <span className="invoice-detail-log-dot" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}

function InfoItem({
  label,
  value,
  href,
  strong,
  wide
}: {
  label: string;
  value: string;
  href?: string;
  strong?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "invoice-detail-info-item is-wide" : "invoice-detail-info-item"}>
      <span>{label}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer">
          {value}
        </a>
      ) : strong ? (
        <strong>{value}</strong>
      ) : (
        <p>{value}</p>
      )}
    </div>
  );
}

function formatInvoiceDetailDate(value?: string | Date | null) {
  if (!value) return "开票资料待补充";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "开票资料待补充";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function getInvoiceTaxNoDisplay(invoice: InvoiceSummary) {
  return invoice.taxNo?.trim() || "开票资料待补充";
}

function getInvoiceBillingContactDisplay(_invoice: InvoiceSummary) {
  return "开票资料待补充";
}

function getInvoiceDetailTimeline(invoice?: InvoiceSummary): InvoiceTimelineItem[] {
  if (!invoice) return [];

  const items: InvoiceTimelineItem[] = [
    {
      status: "DRAFT",
      title: "草稿",
      description: "销售或客服提交开票申请，等待财务核对订单与抬头。"
    },
    {
      status: "APPLIED",
      title: "已申请",
      description: "发票申请已进入财务处理队列。"
    }
  ];

  if (invoice.status === "ISSUED" || invoice.status === "REISSUED") {
    items.push({
      status: invoice.status,
      title: getInvoiceStatusLabel(invoice.status),
      description: invoice.invoiceNo ? `发票号 ${invoice.invoiceNo}，电子文件已归档。` : "发票已开票，等待补充发票号码。"
    });
    items.push({
      status: "SENT",
      title: "可发送",
      description: invoice.fileUrl ? "电子发票文件可发送给客户。" : "请先补充电子文件，再发送给客户。"
    });
  }

  if (invoice.status === "VOIDED") {
    items.push({
      status: "VOIDED",
      title: "已作废",
      description: "该发票已废弃/取消，重开前需确认原发票冲红或作废记录。"
    });
  }

  return items;
}

function getInvoiceOperationLogs(invoice?: InvoiceSummary) {
  const invoiceNo = invoice ? invoice.invoiceNo ?? getInvoiceBusinessLabel(invoice) : "当前发票";
  const logs = [
    {
      title: "创建发票草稿记录",
      description: "销售或客服提交开票申请，等待财务核对订单、抬头和金额。",
      tone: "draft"
    },
    {
      title: "财务经理修改了抬头信息",
      description: `核对 ${invoiceNo} 的发票抬头、关联订单和电子文件状态。`,
      tone: "info"
    }
  ];

  if (invoice?.status === "ISSUED" || invoice?.status === "REISSUED") {
    logs.push({
      title: invoice.status === "REISSUED" ? "发票重新开票" : "发票开票完成",
      description: invoice.invoiceNo ? `发票号 ${invoice.invoiceNo} 已归档，可继续发送电子发票。` : "发票已开票，等待补充发票号码。",
      tone: "success"
    });
  }

  if (invoice?.status === "VOIDED") {
    logs.push({
      title: "发票废弃/取消",
      description: "发票已作废，重开前需保留冲红或作废记录。",
      tone: "danger"
    });
  }

  return logs;
}

function getInvoiceStatusColor(status?: InvoiceStatus) {
  if (status === "ISSUED" || status === "REISSUED") return "success";
  if (status === "VOIDED") return "error";
  return "processing";
}
