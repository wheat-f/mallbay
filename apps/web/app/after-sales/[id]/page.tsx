"use client";

import type { AfterSaleResponsibility, AfterSaleStatus, AfterSaleSummary } from "@mallbay/shared";
import { App, Button, Card, Empty, Skeleton, Tag } from "antd";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  FileSearchOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { afterSalesApi } from "../../../src/lib/api";
import {
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSalePenaltyRiskNote,
  getAfterSalePenaltyRows,
  getAfterSaleResponsibilityDescription,
  getAfterSaleResponsibilityLabel,
  getAfterSaleResponsiblePersonLabel,
  getAfterSaleStatusLabel
} from "../../../src/features/after-sales/display";
import { useAuthStore } from "../../../src/stores/auth-store";

type AfterSaleTimelineItem = {
  key: string;
  title: string;
  description: string;
  tone: "primary" | "success" | "warning" | "muted";
};


export default function AfterSaleDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const afterSaleId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

  const afterSaleQuery = useQuery({
    queryKey: ["after-sales", afterSaleId],
    queryFn: () => afterSalesApi.detail(afterSaleId),
    enabled: Boolean(afterSaleId)
  });

  const afterSale = afterSaleQuery.data;
  const timeline = getAfterSaleDetailTimeline(afterSale);
  const closeMutation = useMutation({
    mutationFn: () => {
      if (!afterSale) throw new Error("售后工单未加载");
      return afterSalesApi.close(afterSale.id);
    },
    onSuccess: async () => {
      message.success("售后工单已归档");
      await queryClient.invalidateQueries({ queryKey: ["after-sales", afterSaleId] });
      await queryClient.invalidateQueries({ queryKey: ["after-sales", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page after-sale-detail-page">
      <section className="after-sale-detail-hero">
        <div>
          <div className="after-sale-detail-breadcrumb">
            <span>售后管理</span>
            <span>/</span>
            <span>{afterSale ? getAfterSaleBusinessLabel(afterSale) : "工单详情"}</span>
          </div>
          <h1>售后工单详情与责任判罚</h1>
          <p>{afterSale ? getAfterSaleBusinessLabel(afterSale) : "集中查看售后证据、责任判定、处罚处理和处理日志"}</p>
        </div>
        <div className="after-sale-detail-actions">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/after-sales")}>
            返回售后列表
          </Button>
          <Button icon={<ExportOutlined />} disabled={!afterSale}>
            导出报告
          </Button>
          <Button
            type="primary"
            disabled={!afterSale || afterSale.status !== "RESOLVED"}
            loading={closeMutation.isPending}
            onClick={() => closeMutation.mutate()}
          >
            确认判罚并归档
          </Button>
        </div>
      </section>

      {afterSaleQuery.isLoading ? (
        <Card className="after-sale-detail-loading">
          <Skeleton active paragraph={{ rows: 10 }} />
        </Card>
      ) : !afterSale ? (
        <Card className="after-sale-detail-empty">
          <Empty description="未找到该售后工单，或当前账号无权查看该门店售后记录" />
        </Card>
      ) : (
        <section className="after-sale-detail-grid">
          <div className="after-sale-detail-main">
            <Card className="after-sale-detail-card after-sale-order-summary">
              <div className="after-sale-card-title">
                <FileSearchOutlined />
                <h2>原订单摘要</h2>
                <Tag color={getAfterSaleStatusColor(afterSale.status)}>{getAfterSaleStatusLabel(afterSale.status)}</Tag>
              </div>
              <div className="after-sale-summary-grid">
                <DetailMetric label="客户信息" value={getOrderCustomerLabel(afterSale)} hint={getOrderVehicleLabel(afterSale)} />
                <DetailMetric label="车型/膜卷号" value={getVehicleModelLabel(afterSale)} hint="材料批次由库存出库后自动追溯" />
                <DetailMetric label="原订单" value={getAfterSaleOrderLabel(afterSale)} hint="原订单记录已关联售后流程" />
              </div>
            </Card>

            <Card className="after-sale-detail-card">
              <div className="after-sale-card-title">
                <WarningOutlined />
                <h2>问题描述与取证</h2>
              </div>
              <div className="after-sale-issue-box">
                <strong>客户诉求：</strong>
                <span>{afterSale.description || "暂无问题描述"}</span>
              </div>
              <div className="after-sale-evidence-grid">
                <PhotoEvidenceCard title="问题照片" urls={afterSale.issuePhotoUrls} emptyText="暂无问题照片" tone="defect" />
                <PhotoEvidenceCard title="施工后照片" urls={afterSale.constructionPhotoUrls} emptyText="暂无施工后照片" tone="after" />
                <div className="after-sale-photo-card is-vehicle">
                  <CameraOutlined />
                  <strong>车辆与订单</strong>
                  <span>{getOrderVehicleLabel(afterSale)}</span>
                </div>
              </div>
            </Card>

            <Card className="after-sale-detail-card">
              <div className="after-sale-card-title">
                <CheckCircleOutlined />
                <h2>售后处理记录</h2>
              </div>
              <div className="after-sale-treatment-record">
                <DetailMetric label="处理分类" value={afterSale.constructionIssueCategory || "未填写"} hint="真实记录：来自售后处理表单" />
                <DetailMetric label="处理方案" value={afterSale.resolutionNote || "未填写"} hint="处理完成前可在售后列表处理面板补充" />
                <DetailMetric label="施工后照片" value={getPhotoCountLabel(afterSale.constructionPhotoUrls, "暂无照片")} hint="只展示已保存到售后单的照片链接" />
              </div>
            </Card>
          </div>

          <aside className="after-sale-detail-side">
            <Card className="after-sale-detail-card after-sale-responsibility-panel">
              <h2>责任判定</h2>
              <div className="after-sale-responsibility-list">
                <div className={afterSale.responsibility !== "PENDING" ? "is-active" : undefined}>
                  {getResponsibilityIcon(afterSale.responsibility)}
                  <div>
                    <strong>{getAfterSaleResponsibilityLabel(afterSale.responsibility)}</strong>
                    <span>{getAfterSaleResponsibilityDescription(afterSale.responsibility)}</span>
                  </div>
                  {afterSale.responsibility !== "PENDING" ? <CheckCircleOutlined /> : null}
                </div>
              </div>
              <div className="after-sale-worker-card">
                <span>责任对象</span>
                <strong>{getAfterSaleResponsiblePersonLabel(afterSale)}</strong>
                <p>{[
                  getAfterSaleResponsibilityLabel(afterSale.responsibility),
                  getAfterSaleResponsibilityDescription(afterSale.responsibility),
                  afterSale.constructionIssueCategory
                ].filter(Boolean).join(" / ")}</p>
              </div>
              <div className="after-sale-worker-card">
                <span>处理人员</span>
                <strong>{getAfterSaleAssignmentLabels(afterSale).join("、") || "暂无派单人员"}</strong>
                <p>真实记录：来自售后派单记录 afterSale.assignments</p>
              </div>
            </Card>

            <Card className="after-sale-detail-card after-sale-penalty-panel">
              <h2>惩罚处理</h2>
              {getAfterSalePenaltyRows(afterSale).map((row) => (
                <PenaltyRow key={row.key} icon={getPenaltyIcon(row.key)} label={row.label} value={row.value} />
              ))}
              <PenaltyRecordList afterSale={afterSale} />
              <div className="after-sale-risk-note">
                <ExclamationCircleOutlined />
                <span>{getAfterSalePenaltyRiskNote(afterSale)}</span>
              </div>
            </Card>

            <Card className="after-sale-detail-card">
              <h2>处理日志</h2>
              <div className="after-sale-detail-timeline">
                {timeline.map((item) => (
                  <div key={item.key} className={`after-sale-timeline-item is-${item.tone}`}>
                    <span />
                    <div>
                      <strong>{item.title}</strong>
                      <p>{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </aside>
        </section>
      )}
    </div>
  );
}

function DetailMetric({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{hint}</p>
    </div>
  );
}

function PhotoEvidenceCard({
  title,
  urls,
  emptyText,
  tone
}: {
  title: string;
  urls?: string[] | null;
  emptyText: string;
  tone: "defect" | "after";
}) {
  const savedUrls = urls?.filter(Boolean) ?? [];
  return (
    <div className={`after-sale-photo-card is-${tone}`}>
      <CameraOutlined />
      <strong>{title}</strong>
      <span>{savedUrls.length > 0 ? `${savedUrls.length} 张照片已归档` : emptyText}</span>
      {savedUrls.length > 0 ? (
        <div className="after-sale-photo-links">
          {savedUrls.map((url, index) => (
            <a key={url} href={url} target="_blank" rel="noreferrer">
              查看照片 {index + 1}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PenaltyRow({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="after-sale-penalty-row">
      <div>
        {icon}
        <span>{label}</span>
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function PenaltyRecordList({ afterSale }: { afterSale: AfterSaleSummary }) {
  const penalties = afterSale.penalties ?? [];
  if (penalties.length === 0) {
    return <div className="after-sale-penalty-empty">真实记录：暂无已保存处罚记录</div>;
  }
  return (
    <div className="after-sale-penalty-records">
      <span>真实记录：afterSale.penalties</span>
      {penalties.map((penalty) => (
        <div key={penalty.id ?? `${penalty.workerUserId}-${penalty.reason}`} className="after-sale-penalty-record">
          <strong>{getUserDisplayName(penalty.worker) || "处罚对象待确认"}</strong>
          <span>{formatPenaltyAmount(penalty.amountCents)} / {penalty.reason || "未填写原因"}</span>
        </div>
      ))}
    </div>
  );
}

function getResponsibilityIcon(responsibility: AfterSaleResponsibility) {
  if (responsibility === "CONSTRUCTION") return <ToolOutlined />;
  if (responsibility === "MATERIAL") return <SafetyCertificateOutlined />;
  if (responsibility === "CUSTOMER") return <UserOutlined />;
  return <FileSearchOutlined />;
}

function getPenaltyIcon(key: string) {
  if (key === "responsibility") return <SafetyCertificateOutlined />;
  if (key === "category") return <ExclamationCircleOutlined />;
  return <DollarOutlined />;
}

function getPhotoCountLabel(urls?: string[] | null, fallback = "待上传") {
  const count = urls?.filter(Boolean).length ?? 0;
  return count > 0 ? `${count} 张照片已归档` : fallback;
}

function getAfterSaleAssignmentLabels(afterSale: AfterSaleSummary) {
  return (afterSale.assignments ?? []).map((assignment) => getUserDisplayName(assignment.worker)).filter(Boolean);
}

function getUserDisplayName(user?: { nickname?: string | null; username?: string | null } | null) {
  return user?.nickname ?? user?.username ?? "";
}

function formatPenaltyAmount(amountCents?: number | null) {
  if (!amountCents) return "未录入金额";
  return `¥${(amountCents / 100).toFixed(2)}`;
}

export function getAfterSaleDetailTimeline(afterSale?: AfterSaleSummary): AfterSaleTimelineItem[] {
  if (!afterSale) return [];

  const items: AfterSaleTimelineItem[] = [
    {
      key: "created",
      title: "发起售后申请",
      description: afterSale.description || "客户提交售后问题，等待客服或主管受理。",
      tone: "primary"
    }
  ];

  if (afterSale.status === "ASSIGNED" || afterSale.status === "RESOLVED" || afterSale.status === "CLOSED") {
    items.push({
      key: "assigned",
      title: "已派单处理",
      description: "售后任务已进入师傅处理队列，照片和处理结果需持续补充。",
      tone: "warning"
    });
  }

  if (afterSale.responsibility !== "PENDING") {
    items.push({
      key: "responsibility",
      title: "完成责任判定",
      description: `判定结果：${getAfterSaleResponsibilityLabel(afterSale.responsibility)}。`,
      tone: "success"
    });
  }

  if (afterSale.status === "RESOLVED" || afterSale.status === "CLOSED") {
    items.push({
      key: "resolved",
      title: "售后处理完成",
      description: "售后结果已归档，可进入后续复盘、质保或处罚追踪。",
      tone: "success"
    });
  }

  if (items.length === 1) {
    items.push({
      key: "pending",
      title: "等待勘察与派单",
      description: "请在售后管理中选择处理师傅，并补充责任判定和处理方案。",
      tone: "muted"
    });
  }

  return items;
}

function getAfterSaleStatusColor(status?: AfterSaleStatus) {
  if (status === "RESOLVED" || status === "CLOSED") return "success";
  if (status === "CANCELLED") return "default";
  if (status === "ASSIGNED") return "processing";
  return "warning";
}

function getOrderCustomerLabel(afterSale: AfterSaleSummary) {
  const customer = afterSale.order?.customer;
  return customer?.companyName ?? customer?.personalName ?? customer?.name ?? customer?.contactPerson ?? "客户信息待确认";
}

function getOrderVehicleLabel(afterSale: AfterSaleSummary) {
  const vehicle = afterSale.order?.vehicle;
  return [vehicle?.plateNo ?? vehicle?.carPlate, getVehicleModelLabel(afterSale)].filter(Boolean).join(" / ") || "车辆信息待确认";
}

function getVehicleModelLabel(afterSale: AfterSaleSummary) {
  const vehicle = afterSale.order?.vehicle;
  return [vehicle?.model ?? vehicle?.carModel, vehicle?.color ?? vehicle?.carColor].filter(Boolean).join(" / ") || "-";
}
