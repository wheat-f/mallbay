"use client";

import { Alert, Button, Card, Drawer, Skeleton, Tag } from "antd";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
  StopOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { warrantiesApi } from "../../../src/lib/api";
import {
  getWarrantyCardRows,
  getWarrantyExpiryReminder,
  getWarrantyOrderLabel,
  getWarrantyStatusLabel
} from "../../../src/features/warranties/display";

export default function WarrantyDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const warrantyId = params.id;
  const [isWarrantyLogOpen, setIsWarrantyLogOpen] = useState(false);

  const warrantyQuery = useQuery({
    queryKey: ["warranty-detail", warrantyId],
    queryFn: () => warrantiesApi.detail(warrantyId),
    enabled: Boolean(warrantyId)
  });

  const warranty = warrantyQuery.data;
  const reminder = warranty ? getWarrantyExpiryReminder(warranty) : { label: "-", color: "default" };
  const cardRows = warranty ? getWarrantyCardRows(warranty) : [];
  const summaryItems = warranty ? getWarrantySummaryItems(warranty) : [];
  const scopeItems = splitWarrantyScope(warranty?.scope);
  const warrantyLogEntries = warranty ? getWarrantyLogEntries(warranty, reminder) : [];

  return (
    <div className="management-page">
      {warrantyQuery.error ? (
        <Alert type="error" showIcon title="质保详情加载失败" description={(warrantyQuery.error as Error).message} />
      ) : null}

      {warrantyQuery.isLoading ? <Skeleton active /> : null}

      {warranty ? (
        <>
          <section className="warranty-detail-hero">
            <div>
              <div className="warranty-detail-breadcrumb">
                <span>质保管理</span>
                <span>/</span>
                <span>质保查询</span>
              </div>
              <div className="warranty-detail-title-row">
                <h1>
                  质保详情 <span>{warranty.warrantyNo}</span>
                </h1>
                <Tag color={reminder.color}>{getWarrantyStatusLabel(warranty.status)}</Tag>
              </div>
              <p>{reminder.label}，质保范围、订单来源和施工证据集中留档，售后核验时从这里进入追溯链路。</p>
            </div>
            <div className="warranty-detail-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/warranties")}>
                返回质保列表
              </Button>
              <Button icon={<HistoryOutlined />} onClick={() => setIsWarrantyLogOpen(true)}>
                查看质保日志
              </Button>
              <Button danger icon={<StopOutlined />}>
                作废/重开质保
              </Button>
              <Button type="primary" icon={<DownloadOutlined />}>
                下载电子质保卡
              </Button>
            </div>
          </section>

          <section className="warranty-detail-summary">
            {summaryItems.map((item) => (
              <div key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </section>

          <section className="warranty-detail-workspace">
            <div className="warranty-detail-main">
              <Card className="warranty-detail-card warranty-core-card" title="质保核心信息">
                <div className="warranty-core-grid">
                  {cardRows.slice(0, 5).map((row) => (
                    <div key={row.label} className={row.label === "质保范围" ? "warranty-core-span" : undefined}>
                      <span>{row.label}</span>
                      {row.label === "状态" ? <Tag color={reminder.color}>{row.value}</Tag> : <strong>{row.value}</strong>}
                    </div>
                  ))}
                  <div>
                    <span>到期提醒</span>
                    <Tag color={reminder.color}>{reminder.label}</Tag>
                  </div>
                </div>
                <div className="warranty-scope-tags">
                  {(scopeItems.length ? scopeItems : ["未设置具体质保范围"]).map((scope) => (
                    <span key={scope}>{scope}</span>
                  ))}
                </div>
              </Card>

              <Card className="warranty-detail-card warranty-trace-banner" title="原材料溯源">
                <div className="warranty-trace-icon">
                  <SafetyCertificateOutlined />
                </div>
                <div>
                  <span>材料批次追溯</span>
                  <strong>订单库存分配后自动沉淀批次链路</strong>
                  <p>该车辆使用的膜卷批次会随订单库存分配沉淀，并关联供应商、出库记录和施工留痕。</p>
                </div>
                <Button onClick={() => router.push("/inventory")}>进入库存追溯</Button>
              </Card>

              <Card className="warranty-detail-card warranty-photo-evidence" title="施工影像存证">
                <div className="warranty-photo-grid">
                  {[
                    ["施工前", "物料、车况和 VIN 留档"],
                    ["施工中", "工艺节点和关键部位记录"],
                    ["施工后", "完工交付与质检证据"]
                  ].map(([title, description]) => (
                    <div key={title} className="warranty-photo-stage">
                      <FileImageOutlined />
                      <strong>{title}</strong>
                      <span>{description}</span>
                    </div>
                  ))}
                </div>
                <Button disabled={!warranty.orderId} onClick={() => router.push(`/construction/orders/${warranty.orderId}`)}>
                  查看施工影像
                </Button>
              </Card>
            </div>

            <aside className="warranty-detail-side">
              <Card className="warranty-detail-card warranty-order-card" title="关联订单" extra={<LinkOutlined />}>
                <div className="warranty-order-label">{getWarrantyOrderLabel(warranty)}</div>
                <div className="warranty-order-actions">
                  <Button disabled={!warranty.orderId} onClick={() => router.push(`/orders/${warranty.orderId}`)}>
                    查看订单
                  </Button>
                  <Button disabled={!warranty.orderId} onClick={() => router.push(`/construction/orders/${warranty.orderId}`)}>
                    查看施工记录
                  </Button>
                </div>
              </Card>

              <Card className="warranty-detail-card warranty-life-card" title="质保生命周期">
                <div className="warranty-life-timeline">
                  {[
                    ["质保开始", formatDate(warranty.startDate), "green"],
                    ["到期提醒", reminder.label, reminder.color === "error" ? "red" : "blue"],
                    ["当前状态", getWarrantyStatusLabel(warranty.status), warranty.status === "ACTIVE" ? "green" : "gray"]
                  ].map(([title, description, tone]) => (
                    <div key={title} className={`warranty-life-item warranty-life-${tone}`}>
                      <ClockCircleOutlined />
                      <div>
                        <strong>{title}</strong>
                        <span>{description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card
                className="warranty-detail-card warranty-after-sales-card"
                title="售后服务记录"
                extra={
                  <Button type="link" disabled={!warranty.orderId} onClick={() => router.push(`/after-sales?orderId=${warranty.orderId}`)}>
                    发起售后申请
                  </Button>
                }
              >
                <div className="warranty-after-sales-timeline">
                  <div className="warranty-after-sales-event">
                    <FileProtectOutlined />
                    <div>
                      <strong>电子质保单系统自动生成</strong>
                      <span>质保卡已生效，有效期至 {formatDate(warranty.endDate)}。</span>
                    </div>
                  </div>
                  {warranty.afterSales?.length ? warranty.afterSales.map((afterSale) => (
                    <div key={afterSale.id} className="warranty-after-sales-event">
                      <FileProtectOutlined />
                      <div>
                        <strong>售后工单：{getAfterSaleStatusLabel(afterSale.status)}</strong>
                        <span>{afterSale.description || "售后问题已关联到该质保卡。"}</span>
                      </div>
                    </div>
                  )) : (
                    <div className="warranty-after-sales-empty">
                      <strong>暂无售后记录</strong>
                      <span>该客户尚未提交售后、维修或复核申请。</span>
                    </div>
                  )}
                </div>
              </Card>

              <div className="warranty-evidence-note">
                <FileProtectOutlined />
                <div>
                  <strong>售后核验入口</strong>
                  <span>发生售后时，优先核对质保范围、施工影像和材料批次，再进入售后工单。</span>
                </div>
              </div>
            </aside>
          </section>

          <Drawer
            title="质保日志"
            size="large"
            open={isWarrantyLogOpen}
            onClose={() => setIsWarrantyLogOpen(false)}
            destroyOnHidden
          >
            <div className="warranty-log-drawer">
              <div className="warranty-log-summary">
                <span>质保编号</span>
                <strong>{warranty.warrantyNo}</strong>
                <Tag color={reminder.color}>{getWarrantyStatusLabel(warranty.status)}</Tag>
              </div>
              <div className="warranty-log-list">
                {warrantyLogEntries.length > 0 ? warrantyLogEntries.map((entry) => (
                  <article key={entry.key} className="warranty-log-entry">
                    <span>{entry.time}</span>
                    <strong>{entry.title}</strong>
                    <p>{entry.description}</p>
                  </article>
                )) : <div className="warranty-log-empty">暂无已记录的质保日志</div>}
              </div>
            </div>
          </Drawer>
        </>
      ) : null}
    </div>
  );
}

function formatDate(value?: string | Date | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "-";
}

function splitWarrantyScope(scope?: string | null) {
  return (scope ?? "")
    .split(/[、/，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getWarrantySummaryItems(warranty: Parameters<typeof getWarrantyOrderLabel>[0]) {
  const order = warranty.order;
  return [
    { label: "客户姓名", value: order?.customer?.companyName ?? order?.customer?.personalName ?? order?.customer?.name ?? "-" },
    { label: "手机号码", value: "联系方式待确认" },
    { label: "车牌号码", value: order?.vehicle?.plateNo ?? order?.vehicle?.carPlate ?? "-" },
    { label: "车辆型号", value: order?.vehicle?.model ?? order?.vehicle?.carModel ?? "-" }
  ];
}

function getWarrantyLogEntries(
  warranty: Parameters<typeof getWarrantyOrderLabel>[0] & {
    warrantyNo?: string | null;
    scope?: string | null;
    status?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    events?: Array<{
      id: string;
      action: string;
      metadata?: Record<string, unknown> | null;
      createdAt?: string | Date | null;
    }>;
  },
  reminder: { label: string }
) {
  void reminder;
  return (warranty.events ?? []).map((event) => ({
    key: event.id,
    title: getWarrantyAuditActionLabel(event.action),
    time: formatDate(event.createdAt),
    description: getWarrantyAuditDescription(event.action, event.metadata)
  }));
}

function getWarrantyAuditActionLabel(action: string) {
  const labels: Record<string, string> = {
    WARRANTY_CREATED: "质保创建",
    WARRANTY_STATUS_CHANGED: "质保状态变更",
    WARRANTY_VOIDED: "质保卡作废",
    WARRANTY_REOPENED: "质保卡重开",
    AFTER_SALE_CREATED: "关联售后发起",
    AFTER_SALE_ASSIGNED: "关联售后派单",
    AFTER_SALE_EVIDENCE_SUBMITTED: "关联售后补充证据",
    AFTER_SALE_RESPONSIBILITY_JUDGED: "关联售后责任判定",
    AFTER_SALE_CLOSED: "关联售后关闭"
  };
  return labels[action] ?? "质保记录变更";
}

function getWarrantyAuditDescription(action: string, metadata?: Record<string, unknown> | null) {
  if (action === "WARRANTY_CREATED") {
    return `质保卡已生成，材料与施工追溯已关联订单 ${typeof metadata?.orderId === "string" ? metadata.orderId : "待确认"}。`;
  }
  if (action.startsWith("AFTER_SALE_")) {
    return "关联售后流程已记录，可在售后详情查看完整处理证据。";
  }
  return "质保状态与处理记录已保存。";
}

function getAfterSaleStatusLabel(status?: string | null) {
  const labels: Record<string, string> = {
    OPEN: "待处理",
    ASSIGNED: "已派单",
    RESOLVED: "已解决",
    CLOSED: "已关闭"
  };
  return status ? labels[status] ?? "处理中" : "处理中";
}
