"use client";

import { Button, Card, Empty, Skeleton, Tag } from "antd";
import {
  ArrowLeftOutlined,
  AuditOutlined,
  BankOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  PaperClipOutlined,
  SafetyCertificateOutlined,
  TransactionOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { financeApi } from "../../../../src/lib/api";
import {
  formatCentsAsYuan,
  getPaymentAccountTypeLabel,
  getPaymentRecordSourceLabel,
  getPaymentRecordTypeLabel
} from "../../../../src/features/finance/display";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../../src/stores/auth-store";

type PaymentRecordDetail = {
  id: string;
  storeId?: string;
  accountId?: string | null;
  type?: string | null;
  amountCents?: number | null;
  sourceId?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
  note?: string | null;
  createdById?: string | null;
  createdAt?: string | null;
  account?: {
    name?: string | null;
    type?: string | null;
    accountNo?: string | null;
  } | null;
};

type FinanceRecordTimelineItem = {
  key: string;
  title: string;
  description: string;
  tone: "success" | "warning" | "primary" | "muted";
};

export default function PaymentRecordDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const recordId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

  const recordsQuery = useQuery({
    queryKey: ["finance-payment-records", storeId],
    queryFn: () => financeApi.paymentRecords(storeId!),
    enabled: Boolean(storeId)
  });

  const record = useMemo(
    () => ((recordsQuery.data ?? []) as PaymentRecordDetail[]).find((item) => item.id === recordId),
    [recordId, recordsQuery.data]
  );
  const timeline = getPaymentRecordDetailTimeline(record);

  return (
    <div className="management-page finance-record-detail-page">
      <StorePageHeader
        title="财务流水详情"
        description={record ? `${getPaymentRecordTypeLabel(record.type)} / ${formatCentsAsYuan(record.amountCents)}` : "查看交易摘要、账户状态、关联单据和审核流轨迹"}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/finance")}>
          返回财务管理
        </Button>
        <Button icon={<DownloadOutlined />} disabled={!record}>
          导出凭证
        </Button>
      </StorePageHeader>

      {recordsQuery.isLoading ? (
        <Card className="finance-record-detail-loading">
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      ) : !record ? (
        <Card className="finance-record-detail-empty">
          <Empty description="未找到该财务流水，或当前账号无权查看该门店流水" />
        </Card>
      ) : (
        <>
          <section className="finance-record-metrics">
            <RecordMetric label="交易金额" value={formatCentsAsYuan(record.amountCents)} tone={getAmountTone(record)} />
            <RecordMetric label="交易类型" value={getPaymentRecordTypeLabel(record.type)} />
            <RecordMetric label="账户/状态" value={getPaymentAccountLabel(record)} />
            <RecordMetric label="交易时间" value={formatRecordDateTime(record.createdAt)} />
          </section>

          <section className="finance-record-detail-grid">
            <div className="finance-record-detail-main">
              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <TransactionOutlined />
                  <h2>交易摘要</h2>
                  <Tag color={record.amountCents && record.amountCents >= 0 ? "success" : "error"}>{getDirectionLabel(record)}</Tag>
                </div>
                <div className="finance-record-summary-card">
                  <strong>{formatCentsAsYuan(record.amountCents)}</strong>
                  <span>{record.note || getPaymentRecordTypeLabel(record.type)}</span>
                </div>
                <div className="finance-record-info-grid">
                  <InfoItem label="交易类型" value={getPaymentRecordTypeLabel(record.type)} />
                  <InfoItem label="流水编号" value={record.id} />
                  <InfoItem label="经办人" value={record.createdById ? "已记录经办人" : "经办人未加载"} />
                  <InfoItem label="门店" value={record.storeId ?? storeId ?? "-"} />
                </div>
              </Card>

              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <FileSearchOutlined />
                  <h2>交易明细</h2>
                </div>
                <div className="finance-record-detail-list">
                  <InfoItem label="摘要" value={record.note || getPaymentRecordTypeLabel(record.type)} />
                  <InfoItem label="金额方向" value={getDirectionLabel(record)} />
                  <InfoItem label="账户/状态" value={getPaymentAccountLabel(record)} />
                  <InfoItem label="创建时间" value={formatRecordDateTime(record.createdAt)} />
                </div>
              </Card>

              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <FileDoneOutlined />
                  <h2>关联单据</h2>
                </div>
                <div className="finance-record-source-card">
                  <div>
                    <span>来源说明</span>
                    <strong>{getPaymentRecordSourceLabel(record, {})}</strong>
                  </div>
                  <div>
                    <span>来源 ID</span>
                    <strong>{record.sourceId ?? record.referenceId ?? "未关联来源单据"}</strong>
                  </div>
                </div>
              </Card>
            </div>

            <aside className="finance-record-detail-side">
              <Card className="finance-record-detail-panel finance-record-status-panel">
                <div className="finance-record-section-title">
                  <BankOutlined />
                  <h2>账户/状态</h2>
                </div>
                <div className="finance-record-account-box">
                  <strong>{record.account?.name ?? "账户未加载"}</strong>
                  <span>{getPaymentAccountTypeLabel(record.account?.type)} / {maskAccountNo(record.account?.accountNo)}</span>
                </div>
                <div className="finance-record-actions">
                  <Button type="primary">确认核销</Button>
                  <Button danger>发起复核</Button>
                </div>
              </Card>

              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <AuditOutlined />
                  <h2>审核流轨迹</h2>
                </div>
                <div className="finance-record-timeline">
                  {timeline.map((item) => (
                    <div key={item.key} className={`finance-record-timeline-item is-${item.tone}`}>
                      <span />
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <PaperClipOutlined />
                  <h2>附件凭证</h2>
                </div>
                <div className="finance-record-attachment">
                  <SafetyCertificateOutlined />
                  <div>
                    <strong>凭证待补充</strong>
                    <span>当前接口未返回附件文件，后续接入 OSS 后展示合同、发票或支付回单。</span>
                  </div>
                </div>
              </Card>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}

function RecordMetric({ label, value, tone }: { label: string; value: string; tone?: "income" | "expense" }) {
  return (
    <Card className={`finance-record-metric ${tone ? `is-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </Card>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="finance-record-info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function getPaymentRecordDetailTimeline(record?: PaymentRecordDetail): FinanceRecordTimelineItem[] {
  if (!record) return [];

  return [
    {
      key: "created",
      title: "创建流水",
      description: `${formatRecordDateTime(record.createdAt)} 记录 ${getPaymentRecordTypeLabel(record.type)}。`,
      tone: "primary"
    },
    {
      key: "source",
      title: "关联业务单据",
      description: record.sourceId ?? record.referenceId ? `来源单据：${record.sourceId ?? record.referenceId}` : "当前流水未关联来源单据。",
      tone: record.sourceId || record.referenceId ? "success" : "muted"
    },
    {
      key: "settlement",
      title: (record.amountCents ?? 0) >= 0 ? "收入入账" : "支出核销",
      description: (record.amountCents ?? 0) >= 0 ? "收入已进入财务流水，可用于经营报表统计。" : "支出已进入财务流水，需保留审批和付款凭证。",
      tone: (record.amountCents ?? 0) >= 0 ? "success" : "warning"
    },
    {
      key: "attachment",
      title: "附件归档",
      description: "附件凭证字段待后续接口补齐。",
      tone: "muted"
    }
  ];
}

function getPaymentAccountLabel(record: PaymentRecordDetail) {
  if (record.account?.name) return record.account.name;
  if (record.accountId) return "账户信息未加载";
  return "未绑定账户";
}

function getDirectionLabel(record: PaymentRecordDetail) {
  return (record.amountCents ?? 0) >= 0 ? "收入" : "支出";
}

function getAmountTone(record: PaymentRecordDetail) {
  return (record.amountCents ?? 0) >= 0 ? "income" : "expense";
}

function maskAccountNo(value?: string | null) {
  if (!value) return "账号未加载";
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function formatRecordDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
