"use client";

import { App, Button, Card, Empty, Input, Skeleton, Tag } from "antd";
import {
  ArrowLeftOutlined,
  AuditOutlined,
  BankOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FileSearchOutlined,
  PaperClipOutlined,
  SafetyCertificateOutlined,
  TransactionOutlined,
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { financeApi } from "../../../../src/features/finance/api";
import {
  formatCentsAsYuan,
  getPaymentAccountTypeLabel,
  getPaymentRecordSourceLabel,
  getPaymentRecordTypeLabel,
} from "../../../../src/features/finance/display";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { exportRowsToExcel } from "../../../../src/lib/export-excel";

type PaymentRecordDetail = {
  id: string;
  storeId?: string;
  accountId?: string | null;
  type?: string | null;
  amountCents?: number | null;
  direction?: "INCOME" | "EXPENSE";
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
  const { message } = App.useApp();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const recordId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const storeName = user?.storeMember?.store.name;

  const recordsQuery = useQuery({
    queryKey: ["finance-payment-records", storeId],
    queryFn: () =>
      financeApi.paymentRecords({ storeId: storeId!, scope: "all" }),
    enabled: Boolean(storeId),
  });

  const record = useMemo(
    () =>
      ((recordsQuery.data?.items ?? []) as PaymentRecordDetail[]).find(
        (item) => item.id === recordId,
      ),
    [recordId, recordsQuery.data],
  );
  const timeline = getPaymentRecordDetailTimeline(record);
  const exportPaymentVoucher = async () => {
    if (!record) return;
    try {
      await exportRowsToExcel(
        `payment-voucher-${record.id}.xlsx`,
        "财务流水凭证",
        [{
          "凭证编号": record.id,
          "门店": storeName ?? "当前门店",
          "交易方向": getDirectionLabel(record),
          "交易类型": getPaymentRecordTypeLabel(record.type),
          "交易金额": Number(record.amountCents ?? 0) / 100,
          "收付款账户": record.account?.name ?? "未指定账户",
          "账户类型": getPaymentAccountTypeLabel(record.account?.type),
          "账户尾号": maskAccountNo(record.account?.accountNo),
          "来源单据类型": record.referenceType ?? "-",
          "来源单据编号": record.sourceId ?? record.referenceId ?? "-",
          "摘要": record.note || getPaymentRecordSummaryLabel(record),
          "经办人编号": record.createdById ?? "-",
          "交易时间": record.createdAt ? new Date(record.createdAt) : "-"
        }],
        { title: "财务流水凭证", subtitle: "交易摘要、账户信息和来源单据留档" }
      );
      message.success("财务流水凭证已导出");
    } catch (error) {
      message.error(error instanceof Error ? error.message : "财务流水凭证导出失败");
    }
  };

  return (
    <div className="management-page finance-record-detail-page">
      <section className="finance-record-detail-hero">
        <div>
          <div className="finance-record-detail-breadcrumb">
            <span>财务管理</span>
            <span>/</span>
            <span>
              {record ? getPaymentRecordTypeLabel(record.type) : "流水详情"}
            </span>
          </div>
          <div className="finance-record-detail-title-row">
            <h1>财务流水详情</h1>
            {record ? (
              <Tag color={record.direction === "INCOME" ? "success" : "error"}>
                {getDirectionLabel(record)}
              </Tag>
            ) : null}
          </div>
          <p>
            {record
              ? `${getPaymentRecordTypeLabel(record.type)} / ${formatCentsAsYuan(record.amountCents)}`
              : "查看交易摘要、账户状态、关联单据和审核流轨迹"}
          </p>
        </div>
        <div className="finance-record-detail-actions">
          <Button
            icon={<ArrowLeftOutlined />}
            onClick={() => router.push("/finance/ledger")}
          >
            返回收支流水
          </Button>
          <Button icon={<DownloadOutlined />} disabled={!record} onClick={() => void exportPaymentVoucher()}>
            导出凭证
          </Button>
        </div>
      </section>

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
            <RecordMetric
              label="交易金额"
              value={formatCentsAsYuan(record.amountCents)}
              tone={getAmountTone(record)}
            />
            <RecordMetric
              label="交易类型"
              value={getPaymentRecordTypeLabel(record.type)}
            />
            <RecordMetric
              label="账户/状态"
              value={getPaymentAccountLabel(record)}
            />
            <RecordMetric
              label="交易时间"
              value={formatRecordDateTime(record.createdAt)}
            />
          </section>

          <section className="finance-record-detail-grid">
            <div className="finance-record-detail-main">
              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <TransactionOutlined />
                  <h2>交易摘要</h2>
                  <Tag
                    color={record.direction === "INCOME" ? "success" : "error"}
                  >
                    {getDirectionLabel(record)}
                  </Tag>
                </div>
                <div className="finance-record-summary-card">
                  <strong>{formatCentsAsYuan(record.amountCents)}</strong>
                  <span>
                    {record.note || getPaymentRecordTypeLabel(record.type)}
                  </span>
                </div>
                <div className="finance-record-info-grid">
                  <InfoItem
                    label="交易类型"
                    value={getPaymentRecordTypeLabel(record.type)}
                  />
                  <InfoItem
                    label="流水摘要"
                    value={getPaymentRecordSummaryLabel(record)}
                  />
                  <InfoItem
                    label="经办人"
                    value={record.createdById ? "已记录经办人" : "待确认经办人"}
                  />
                  <InfoItem label="门店" value={storeName ?? "当前门店"} />
                </div>
              </Card>

              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <FileSearchOutlined />
                  <h2>交易明细</h2>
                </div>
                <div className="finance-record-detail-list">
                  <InfoItem
                    label="摘要"
                    value={
                      record.note || getPaymentRecordTypeLabel(record.type)
                    }
                  />
                  <InfoItem
                    label="金额方向"
                    value={getDirectionLabel(record)}
                  />
                  <InfoItem
                    label="账户/状态"
                    value={getPaymentAccountLabel(record)}
                  />
                  <InfoItem
                    label="创建时间"
                    value={formatRecordDateTime(record.createdAt)}
                  />
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
                    <span>关联状态</span>
                    <strong>
                      {record.sourceId || record.referenceId
                        ? "已关联来源单据"
                        : "未关联来源单据"}
                    </strong>
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
                  <strong>{getPaymentAccountLabel(record)}</strong>
                  <span>
                    {getPaymentAccountTypeLabel(record.account?.type)} /{" "}
                    {maskAccountNo(record.account?.accountNo)}
                  </span>
                </div>
                <div className="finance-record-actions">
                  <Button onClick={() => router.push("/finance/ledger")}>
                    返回流水列表
                  </Button>
                </div>
              </Card>

              <Card className="finance-record-detail-panel">
                <div className="finance-record-section-title">
                  <AuditOutlined />
                  <h2>审核流轨迹</h2>
                </div>
                <div className="finance-record-timeline">
                  {timeline.map((item) => (
                    <div
                      key={item.key}
                      className={`finance-record-timeline-item is-${item.tone}`}
                    >
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
                <div className="finance-record-voucher-panel">
                  <div className="finance-record-voucher-head">
                    <div>
                      <span>打款详情与凭证</span>
                      <strong>{getPaymentRecordTypeLabel(record.type)}</strong>
                    </div>
                    <Tag
                      color={
                        record.direction === "INCOME" ? "success" : "warning"
                      }
                    >
                      {getDirectionLabel(record)}
                    </Tag>
                  </div>
                  <div className="finance-record-voucher-summary">
                    <span>打款金额</span>
                    <strong>{formatCentsAsYuan(record.amountCents)}</strong>
                  </div>
                  <div className="finance-record-upload-box">
                    <PaperClipOutlined />
                    <strong>上传银行凭证</strong>
                    <span>
                      支持 PNG、JPG 或 PDF 格式，凭证归档后可随流水导出。
                    </span>
                  </div>
                  <label className="finance-record-voucher-note">
                    <span>财务备注</span>
                    <Input.TextArea
                      rows={3}
                      value={record.note ?? ""}
                      placeholder="输入相关备注信息"
                      readOnly
                    />
                  </label>
                  <div className="finance-record-voucher-time">
                    <span>
                      记录时间: {formatRecordDateTime(record.createdAt)}
                    </span>
                  </div>
                  <Button type="primary" block disabled>
                    提交并标记已打款
                  </Button>
                </div>
                <div className="finance-record-attachment">
                  <SafetyCertificateOutlined />
                  <div>
                    <strong>凭证待补充</strong>
                    <span>
                      支持上传银行回单、合同、发票或付款截图，归档后可随流水导出。
                    </span>
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

function RecordMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "income" | "expense";
}) {
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

function getPaymentRecordDetailTimeline(
  record?: PaymentRecordDetail,
): FinanceRecordTimelineItem[] {
  if (!record) return [];

  return [
    {
      key: "created",
      title: "创建流水",
      description: `${formatRecordDateTime(record.createdAt)} 记录 ${getPaymentRecordTypeLabel(record.type)}。`,
      tone: "primary",
    },
    {
      key: "source",
      title: "关联业务单据",
      description:
        record.sourceId || record.referenceId
          ? "已关联来源单据。"
          : "当前流水未关联来源单据。",
      tone: record.sourceId || record.referenceId ? "success" : "muted",
    },
    {
      key: "settlement",
      title: record.direction === "INCOME" ? "收入入账" : "支出核销",
      description:
        record.direction === "INCOME"
          ? "收入已进入财务流水，可用于报表分析统计。"
          : "支出已进入财务流水，需保留审批和付款凭证。",
      tone: record.direction === "INCOME" ? "success" : "warning",
    },
    {
      key: "attachment",
      title: "附件归档",
      description: "附件凭证待归档。",
      tone: "muted",
    },
  ];
}

function getPaymentAccountLabel(record: PaymentRecordDetail) {
  if (record.account?.name) return record.account.name;
  if (record.accountId) return "待确认账户信息";
  return "账户待绑定";
}

function getPaymentRecordSummaryLabel(record: PaymentRecordDetail) {
  return (
    record.note ||
    `${getPaymentRecordTypeLabel(record.type)} / ${formatRecordDateTime(record.createdAt)}`
  );
}

function getDirectionLabel(record: PaymentRecordDetail) {
  return (record.amountCents ?? 0) >= 0 ? "收入" : "支出";
}

function getAmountTone(record: PaymentRecordDetail) {
  return (record.amountCents ?? 0) >= 0 ? "income" : "expense";
}

function maskAccountNo(value?: string | null) {
  if (!value) return "账号待补录";
  return value.length <= 4 ? "****" : `****${value.slice(-4)}`;
}

function formatRecordDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { hour12: false });
}
