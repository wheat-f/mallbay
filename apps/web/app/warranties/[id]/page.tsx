"use client";

import { Alert, Button, Card, Tag } from "antd";
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  FileImageOutlined,
  FileProtectOutlined,
  HistoryOutlined,
  LinkOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { warrantiesApi } from "../../../src/lib/api";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
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

  return (
    <div className="management-page">
      <StorePageHeader title="质保详情" description="查看质保核心信息、关联订单和追溯入口" />

      {warrantyQuery.error ? (
        <Alert type="error" showIcon title="质保详情加载失败" description={(warrantyQuery.error as Error).message} />
      ) : null}

      {warranty ? (
        <>
          <section className="warranty-detail-hero">
            <div>
              <div className="warranty-detail-breadcrumb">
                <span>质保管理</span>
                <span>/</span>
                <span>质保详情</span>
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
                返回质保管理
              </Button>
              <Button icon={<HistoryOutlined />}>查看质保日志</Button>
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
                  <p>批次、供应商和出库记录来自订单库存分配。当前页面不伪造批次数据，后续通过订单和库存流水承接完整追溯。</p>
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

              <div className="warranty-evidence-note">
                <FileProtectOutlined />
                <div>
                  <strong>售后核验入口</strong>
                  <span>发生售后时，优先核对质保范围、施工影像和材料批次，再进入售后工单。</span>
                </div>
              </div>
            </aside>
          </section>
        </>
      ) : null}
    </div>
  );
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}

function splitWarrantyScope(scope?: string | null) {
  return (scope ?? "")
    .split(/[、/，,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getWarrantySummaryItems(warranty: Parameters<typeof getWarrantyOrderLabel>[0] & { endDate?: string | null }) {
  const order = warranty.order;
  return [
    { label: "客户姓名", value: order?.customer?.companyName ?? order?.customer?.personalName ?? order?.customer?.name ?? "-" },
    { label: "车牌号码", value: order?.vehicle?.plateNo ?? order?.vehicle?.carPlate ?? "-" },
    { label: "车辆型号", value: order?.vehicle?.model ?? order?.vehicle?.carModel ?? "-" },
    { label: "质保到期", value: formatDate(warranty.endDate) }
  ];
}
