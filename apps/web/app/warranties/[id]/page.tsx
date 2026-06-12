"use client";

import { Alert, Button, Card, Descriptions, Layout, Space, Tag, Timeline, Typography } from "antd";
import { ArrowLeftOutlined, FileProtectOutlined, LinkOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
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

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="质保详情" description="查看质保核心信息、关联订单和追溯入口">
          <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/warranties")}>
            返回质保管理
          </Button>
        </StorePageHeader>

        {warrantyQuery.error ? (
          <Alert type="error" showIcon message="质保详情加载失败" description={(warrantyQuery.error as Error).message} />
        ) : null}

        {warranty ? (
          <>
            <div className="mb-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {[
                ["质保编号", warranty.warrantyNo, "电子质保唯一编号"],
                ["质保状态", getWarrantyStatusLabel(warranty.status), reminder.label],
                ["关联订单", getWarrantyOrderLabel(warranty), "订单、客户和车辆来源"],
                ["质保范围", warranty.scope, "售后核验依据"]
              ].map(([label, value, description]) => (
                <Card key={label} size="small">
                  <Typography.Text type="secondary">{label}</Typography.Text>
                  <div className="mt-2 text-lg font-semibold text-gray-900">{value}</div>
                  <Typography.Text type="secondary" className="text-xs">
                    {description}
                  </Typography.Text>
                </Card>
              ))}
            </div>

            <Card className="mb-4" title="质保核心信息">
              <Descriptions bordered column={{ xs: 1, md: 2, xl: 3 }}>
                {getWarrantyCardRows(warranty).map((row) => (
                  <Descriptions.Item key={row.label} label={row.label}>
                    {row.label === "状态" ? <Tag color={reminder.color}>{row.value}</Tag> : row.value}
                  </Descriptions.Item>
                ))}
                <Descriptions.Item label="到期提醒">
                  <Tag color={reminder.color}>{reminder.label}</Tag>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <div className="mb-4 grid gap-4 xl:grid-cols-3">
              <Card title="关联订单" extra={<LinkOutlined />}>
                <Typography.Paragraph>{getWarrantyOrderLabel(warranty)}</Typography.Paragraph>
                <Space wrap>
                  <Button disabled={!warranty.orderId} onClick={() => router.push(`/orders/${warranty.orderId}`)}>
                    查看订单
                  </Button>
                  <Button disabled={!warranty.orderId} onClick={() => router.push(`/construction/orders/${warranty.orderId}`)}>
                    查看施工记录
                  </Button>
                </Space>
              </Card>

              <Card title="原材料溯源" extra={<SafetyCertificateOutlined />}>
                <Typography.Paragraph type="secondary">
                  批次、供应商和出库记录来自订单库存分配。当前页面不伪造批次数据，后续通过订单和库存流水承接完整追溯。
                </Typography.Paragraph>
                <Button onClick={() => router.push("/inventory")}>进入库存追溯</Button>
              </Card>

              <Card title="施工影像存证" extra={<FileProtectOutlined />}>
                <Typography.Paragraph type="secondary">
                  施工前、施工中、施工后照片由施工记录维护。质保核验时应优先查看关联施工记录中的影像证据。
                </Typography.Paragraph>
                <Button disabled={!warranty.orderId} onClick={() => router.push(`/construction/orders/${warranty.orderId}`)}>
                  查看影像
                </Button>
              </Card>
            </div>

            <Card title="质保生命周期">
              <Timeline
                items={[
                  { color: "green", children: `质保开始：${formatDate(warranty.startDate)}` },
                  { color: reminder.color === "error" ? "red" : "blue", children: `到期提醒：${reminder.label}` },
                  { color: warranty.status === "ACTIVE" ? "green" : "gray", children: `当前状态：${getWarrantyStatusLabel(warranty.status)}` }
                ]}
              />
            </Card>
          </>
        ) : null}
      </Layout.Content>
    </Layout>
  );
}

function formatDate(value?: string | null) {
  return value ? value.slice(0, 10) : "-";
}
