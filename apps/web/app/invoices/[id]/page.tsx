"use client";

import type { InvoiceStatus, InvoiceSummary } from "@mallbay/shared";
import { Button, Card, Empty, Skeleton, Tag } from "antd";
import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  LinkOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { invoicesApi } from "../../../src/lib/api";
import { formatCentsAsYuan } from "../../../src/features/finance/display";
import {
  getInvoiceBusinessLabel,
  getInvoiceFileDisplay,
  getInvoiceOrderLabel,
  getInvoiceStatusLabel
} from "../../../src/features/invoices/display";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
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
      <StorePageHeader
        title="发票详情"
        description="查看发票基础信息、关联订单、明细项目、状态变迁历史与内部备注"
      >
        <Link href="/invoices">
          <Button>返回发票管理</Button>
        </Link>
        <Button icon={<ReloadOutlined />}>重新开具</Button>
        <Button danger icon={<CloseCircleOutlined />}>
          废弃/取消发票
        </Button>
      </StorePageHeader>

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
                <Tag color={getInvoiceStatusColor(invoice.status)}>{getInvoiceStatusLabel(invoice.status)}</Tag>
              </div>

              <div className="invoice-detail-info-grid">
                <InfoItem label="发票抬头" value={invoice.title} />
                <InfoItem label="发票号码" value={invoice.invoiceNo ?? "待开具"} />
                <InfoItem label="发票金额" value={formatCentsAsYuan(invoice.amountCents)} strong />
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
                <span>小计</span>
              </div>
              <div className="invoice-detail-line-row">
                <div>
                  <strong>漆面保护膜施工服务</strong>
                  <p>{getInvoiceOrderLabel(invoice)}</p>
                </div>
                <span>订单开票</span>
                <span>1</span>
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
                核对订单收款、发票抬头和电子文件后再发送给客户。作废或重开时需保留原因，方便后续财务对账。
              </p>
              <Button type="primary" block>
                添加备注
              </Button>
            </Card>

            <Card className="invoice-detail-total-card">
              <span>本张发票金额</span>
              <strong>{formatCentsAsYuan(invoice.amountCents)}</strong>
              <p>已纳入本店发票流水与经营报表统计。</p>
            </Card>
          </aside>
        </section>
      )}
    </div>
  );
}

function InfoItem({ label, value, href, strong }: { label: string; value: string; href?: string; strong?: boolean }) {
  return (
    <div className="invoice-detail-info-item">
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

export function getInvoiceDetailTimeline(invoice?: InvoiceSummary): InvoiceTimelineItem[] {
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
      title: invoice.status === "REISSUED" ? "已重开" : "已开具",
      description: invoice.invoiceNo ? `发票号 ${invoice.invoiceNo}，电子文件已归档。` : "发票已开具，等待补充发票号码。"
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

function getInvoiceStatusColor(status?: InvoiceStatus) {
  if (status === "ISSUED" || status === "REISSUED") return "success";
  if (status === "VOIDED") return "error";
  return "processing";
}
