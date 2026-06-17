"use client";

import type { AfterSaleResponsibility, AfterSaleStatus, AfterSaleSummary } from "@mallbay/shared";
import { Button, Card, Empty, Input, Skeleton, Tag } from "antd";
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
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { afterSalesApi } from "../../../src/lib/api";
import {
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel
} from "../../../src/features/after-sales/display";
import { useAuthStore } from "../../../src/stores/auth-store";

type AfterSaleTimelineItem = {
  key: string;
  title: string;
  description: string;
  tone: "primary" | "success" | "warning" | "muted";
};

const RESPONSIBILITY_OPTIONS: Array<{
  value: AfterSaleResponsibility;
  title: string;
  description: string;
  icon: ReactNode;
}> = [
  {
    value: "CONSTRUCTION",
    title: "施工方责任",
    description: "施工边角收口、环境落尘或工艺执行不到位导致。",
    icon: <ToolOutlined />
  },
  {
    value: "MATERIAL",
    title: "原厂产品质量",
    description: "膜材、胶层或批次质量异常导致。",
    icon: <SafetyCertificateOutlined />
  },
  {
    value: "CUSTOMER",
    title: "客户人为损坏",
    description: "外力剐蹭、清洗不当或使用场景导致。",
    icon: <UserOutlined />
  }
];

export default function AfterSaleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const afterSaleId = params.id;
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

  const afterSalesQuery = useQuery({
    queryKey: ["after-sales", storeId],
    queryFn: () => afterSalesApi.list(storeId!),
    enabled: Boolean(storeId)
  });

  const afterSale = useMemo(
    () => afterSalesQuery.data?.find((item) => item.id === afterSaleId),
    [afterSaleId, afterSalesQuery.data]
  );
  const timeline = getAfterSaleDetailTimeline(afterSale);

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
          <Button type="primary" disabled={!afterSale}>
            确认判罚并归档
          </Button>
        </div>
      </section>

      {afterSalesQuery.isLoading ? (
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
                {[
                  ["问题近景", "翘边 / 气泡 / 尘点", "defect"],
                  ["车辆全景", getOrderVehicleLabel(afterSale), "vehicle"],
                  ["细节复核", "待上传高清证据", "detail"]
                ].map(([title, description, tone]) => (
                  <div key={title} className={`after-sale-photo-card is-${tone}`}>
                    <CameraOutlined />
                    <strong>{title}</strong>
                    <span>{description}</span>
                  </div>
                ))}
                <button className="after-sale-photo-add" type="button">
                  <CameraOutlined />
                  <span>补充证据</span>
                </button>
              </div>
            </Card>

            <Card className="after-sale-detail-card">
              <div className="after-sale-card-title">
                <CheckCircleOutlined />
                <h2>售后处理对比</h2>
              </div>
              <div className="after-sale-compare-grid">
                <ComparePanel tone="before" title="处理前（问题点）" badge="待复核" />
                <ComparePanel tone="after" title="处理后（重施工完成）" badge="待上传" />
              </div>
            </Card>
          </div>

          <aside className="after-sale-detail-side">
            <Card className="after-sale-detail-card after-sale-responsibility-panel">
              <h2>责任判定</h2>
              <div className="after-sale-responsibility-list">
                {RESPONSIBILITY_OPTIONS.map((option) => (
                  <div
                    key={option.value}
                    className={option.value === afterSale.responsibility ? "is-active" : undefined}
                  >
                    {option.icon}
                    <div>
                      <strong>{option.title}</strong>
                      <span>{option.description}</span>
                    </div>
                    {option.value === afterSale.responsibility ? <CheckCircleOutlined /> : null}
                  </div>
                ))}
              </div>
              <div className="after-sale-worker-card">
                <span>责任技师</span>
                <strong>{afterSale.responsibility === "CONSTRUCTION" ? "待从派单记录确认" : "非施工或待判责"}</strong>
                <p>{getAfterSaleResponsibilityLabel(afterSale.responsibility)}</p>
              </div>
            </Card>

            <Card className="after-sale-detail-card after-sale-penalty-panel">
              <h2>惩罚处理</h2>
              <PenaltyRow icon={<DollarOutlined />} label="工资扣减（施工提成）" value="待录入" />
              <PenaltyRow icon={<ExclamationCircleOutlined />} label="质量罚款" value="待录入" />
              <PenaltyRow icon={<SafetyCertificateOutlined />} label="绩效积分扣除" value="待评估" />
              <label className="after-sale-penalty-note">
                <span>处罚备注说明</span>
                <Input.TextArea rows={3} placeholder="在此输入对技师的改进建议或详细处理理由..." />
              </label>
              <div className="after-sale-risk-note">
                <ExclamationCircleOutlined />
                <span>处罚金额在处理面板录入后自动沉淀到售后记录；本月累计售后较多时，建议进行工艺二次培训或降级处理。</span>
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

function ComparePanel({ title, badge, tone }: { title: string; badge: string; tone: "before" | "after" }) {
  return (
    <div className={`after-sale-compare-panel is-${tone}`}>
      <span>{title}</span>
      <div>
        <strong>{badge}</strong>
      </div>
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
