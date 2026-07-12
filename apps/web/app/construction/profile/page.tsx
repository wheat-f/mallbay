"use client";

import { useMemo } from "react";
import { Button, Card, Empty, Table, Tag } from "antd";
import {
  CalendarOutlined,
  CheckCircleOutlined,
  FileImageOutlined,
  ShopOutlined,
  SolutionOutlined,
  ToolOutlined,
  UserOutlined
} from "@ant-design/icons";
import { getWorkerPhotoStageLabel, getWorkerTaskStatusLabel } from "@mallbay/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";

type ArchiveRecord = {
  id: string;
  orderId: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  actualMinutes?: number | null;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    constructionType?: string | null;
    constructionLocation?: string | null;
    customer?: { name?: string | null } | null;
    vehicle?: { plateNo?: string | null; brand?: string | null; model?: string | null } | null;
  } | null;
  photos?: { id: string; stage: string; url?: string | null }[];
  qualityChecks?: { id: string; result?: string | null; checkedAt?: string | null }[];
};

const photoStages = ["BEFORE", "DURING", "AFTER"] as const;

export default function ConstructionProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeMember = user?.storeMember;
  const storeId = storeMember?.store.id;

  const archiveQuery = useQuery({
    queryKey: ["construction-worker-archive", storeId],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const records = useMemo(() => (archiveQuery.data ?? []) as ArchiveRecord[], [archiveQuery.data]);
  const completedRecords = records.filter((record) => record.status === "COMPLETED");
  const photoCount = records.reduce((total, record) => total + (record.photos?.length ?? 0), 0);
  const qualityPassedCount = records.filter((record) =>
    (record.qualityChecks ?? []).some((check) => check.result === "PASSED")
  ).length;
  const stageCounts = photoStages.map((stage) => ({
    stage,
    label: getWorkerPhotoStageLabel(stage),
    count: records.reduce(
      (total, record) => total + (record.photos ?? []).filter((photo) => photo.stage === stage).length,
      0
    )
  }));

  return (
    <div className="management-page worker-profile-page">
      <StorePageHeader title="施工档案" description="汇总我的施工工单、照片凭证、质检与履约记录。">
        <Button icon={<CalendarOutlined />} onClick={() => router.push("/construction/schedules")}>
          查看排班
        </Button>
        <Button type="primary" icon={<ToolOutlined />} onClick={() => router.push("/construction/tasks")}>
          返回我的任务
        </Button>
      </StorePageHeader>

      <section className="worker-archive-hero">
        <div>
          <Tag color="processing">施工履约档案</Tag>
          <h2>{user?.nickname ?? user?.username ?? "施工人员"}</h2>
          <p>
            {storeMember?.store.name ?? "未加入门店"} · {getPositionLabel(storeMember?.position)} ·
            真实记录来自已分配施工工单、照片和质检结果。
          </p>
        </div>
        <Button
          icon={<ShopOutlined />}
          disabled={!storeMember}
          onClick={() => storeMember && router.push(`/workbench/${storeMember.store.id}`)}
        >
          进入门店工作台
        </Button>
      </section>

      <section className="worker-archive-kpis" aria-label="施工档案概览">
        {[
          { label: "参与工单", value: records.length, icon: <SolutionOutlined /> },
          { label: "已完工", value: completedRecords.length, icon: <CheckCircleOutlined /> },
          { label: "照片凭证", value: photoCount, icon: <FileImageOutlined /> },
          { label: "质检通过", value: qualityPassedCount, icon: <CheckCircleOutlined /> }
        ].map((item) => (
          <article key={item.label}>
            <span>{item.icon}</span>
            <div>
              <strong>{item.value}</strong>
              <em>{item.label}</em>
            </div>
          </article>
        ))}
      </section>

      <section className="worker-profile-grid">
        <Card className="worker-archive-main-card" title="最近施工记录">
          <Table<ArchiveRecord>
            rowKey="id"
            loading={archiveQuery.isLoading}
            dataSource={records}
            pagination={records.length > 6 ? { pageSize: 6 } : false}
            locale={{ emptyText: <Empty description="暂无施工记录" /> }}
            columns={[
              {
                title: "订单",
                render: (_, record) => (
                  <div className="worker-archive-order">
                    <strong>{record.order?.orderNo ?? "订单信息待确认"}</strong>
                    <span>{record.order?.customer?.name ?? "客户待确认"}</span>
                  </div>
                )
              },
              {
                title: "车辆",
                render: (_, record) => formatVehicle(record)
              },
              {
                title: "预约",
                render: (_, record) => formatSchedule(record)
              },
              {
                title: "状态",
                render: (_, record) => <Tag color={getStatusColor(record.status)}>{getWorkerTaskStatusLabel(record.status)}</Tag>
              },
              {
                title: "照片",
                render: (_, record) => `${record.photos?.length ?? 0} 张`
              }
            ]}
          />
        </Card>

        <aside className="worker-archive-side">
          <Card className="worker-archive-photo-card" title="照片与质检归档">
            <h3>照片阶段统计</h3>
            <div className="worker-archive-photo-stages">
              {stageCounts.map((item) => (
                <div key={item.stage}>
                  <span>{item.label}</span>
                  <strong>{item.count} 张</strong>
                </div>
              ))}
            </div>
            <div className="worker-archive-quality">
              <span>质检通过</span>
              <strong>{qualityPassedCount} 单</strong>
            </div>
          </Card>

          <Card className="worker-archive-capability-card" title="账号与门店">
            <div className="worker-archive-capability-list">
              <div>
                <UserOutlined />
                <span>
                  <strong>{getPositionLabel(storeMember?.position)}</strong>
                  <em>当前施工身份</em>
                </span>
              </div>
              <div>
                <ShopOutlined />
                <span>
                  <strong>{storeMember?.store.name ?? "未加入门店"}</strong>
                  <em>所属门店</em>
                </span>
              </div>
            </div>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function formatSchedule(record: ArchiveRecord) {
  const date = record.order?.appointmentDate?.slice(0, 10) ?? "日期待定";
  return `${date} ${record.order?.appointmentTimeSlot ?? "时段待定"}`;
}

function formatVehicle(record: ArchiveRecord) {
  const vehicle = record.order?.vehicle;
  return [vehicle?.plateNo, vehicle?.brand, vehicle?.model].filter(Boolean).join(" / ") || "车辆待确认";
}

function getStatusColor(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_CONSTRUCTION") return "processing";
  if (status === "DISPATCHED") return "warning";
  return "default";
}

function getPositionLabel(position?: string) {
  if (position === "CONSTRUCTION") return "施工员";
  if (position === "APPRENTICE") return "学徒";
  if (position === "SCHEDULER") return "施工主管";
  return "施工身份待确认";
}
