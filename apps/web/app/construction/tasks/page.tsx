"use client";

import { App, Button, Card, Empty, Space, Table, Tag } from "antd";
import {
  CheckOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import { buildWorkerTaskSegments, filterWorkerTasks, getWorkerTaskStatusLabel, type WorkerTaskSegmentKey } from "@mallbay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type TaskRow = {
  id: string;
  orderId: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  photoCount?: number;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    constructionLocation?: string | null;
    outsideAddress?: string | null;
  };
  photos?: { stage?: string | null }[];
};

export default function ConstructionTasksPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [activeSegment, setActiveSegment] = useState<WorkerTaskSegmentKey>("today");

  const tasksQuery = useQuery({
    queryKey: ["construction-tasks", storeId],
    queryFn: () => constructionApi.fulfillments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const startMutation = useMutation({
    mutationFn: (orderId: string) => constructionApi.startOrder(orderId),
    onSuccess: async () => {
      message.success("已开工");
      await queryClient.invalidateQueries({ queryKey: ["construction-tasks", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const completeMutation = useMutation({
    mutationFn: (orderId: string) => constructionApi.completeOrder(orderId, new Date().toISOString()),
    onSuccess: async () => {
      message.success("已完工");
      await queryClient.invalidateQueries({ queryKey: ["construction-tasks", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const rows = useMemo(
    () => (tasksQuery.data?.items ?? []).map((item) => ({
      id: item.id,
      orderId: item.orderId,
      status: item.constructionStatus,
      photoCount: item.photoCount,
      order: {
        orderNo: item.orderNo,
        appointmentDate: item.appointmentDate,
        appointmentTimeSlot: item.appointmentTimeSlot,
        constructionLocation: item.constructionLocation,
        outsideAddress: null
      }
    } satisfies TaskRow)),
    [tasksQuery.data?.items]
  );
  const todayKey = new Date().toISOString().slice(0, 10);
  const workerRows = useMemo(
    () => rows.map((row) => ({
      id: row.id,
      orderId: row.orderId,
      status: row.status,
      appointmentDate: row.order?.appointmentDate
    })),
    [rows]
  );
  const taskSegments = useMemo(() => buildWorkerTaskSegments(workerRows, todayKey), [todayKey, workerRows]);
  const visibleRows = useMemo(() => {
    const visibleIds = new Set(filterWorkerTasks(workerRows, activeSegment, todayKey).map((row) => row.id));
    return rows.filter((row) => visibleIds.has(row.id));
  }, [activeSegment, rows, todayKey, workerRows]);
  const activeCount = rows.filter((row) => row.status !== "COMPLETED").length;
  const pendingCount = taskSegments.find((item) => item.key === "pending")?.count ?? 0;
  const inProgressCount = taskSegments.find((item) => item.key === "active")?.count ?? 0;
  const completedCount = taskSegments.find((item) => item.key === "completed")?.count ?? 0;
  const todayCount = taskSegments.find((item) => item.key === "today")?.count ?? 0;

  return (
    <div className="management-page worker-task-center-page">
      <StorePageHeader title="我的施工任务" description="查看派工任务、开工状态、照片凭证和完工记录">
        <Button icon={<ReloadOutlined />} loading={tasksQuery.isFetching} onClick={() => tasksQuery.refetch()}>
          刷新任务
        </Button>
      </StorePageHeader>

      <section className="worker-task-center-hero">
        <div>
          <span>施工人员任务中心</span>
          <h2>{getWorkerDisplayName(user)}，你好</h2>
          <p>当前有 {activeCount} 个待处理施工事项，可在 Web 桌面端完成开工、完工和凭证补录。</p>
        </div>
        <Tag color="processing">实时同步</Tag>
      </section>

      <section className="management-kpi-grid management-kpi-grid-four worker-task-center-kpis">
        {[
          ["今日任务", todayCount, "按预约日期统计"],
          ["待开工", pendingCount, "已派工待执行"],
          ["施工中", inProgressCount, "正在履约"],
          ["已完成", completedCount, "已提交完工"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </section>

      <nav className="worker-task-center-filters" aria-label="施工任务状态筛选">
        {taskSegments.map((segment) => (
          <button
            key={segment.key}
            className={activeSegment === segment.key ? "is-active" : undefined}
            type="button"
            onClick={() => setActiveSegment(segment.key)}
          >
            {segment.label}
            <em>{segment.count}</em>
          </button>
        ))}
      </nav>

      <Card className="worker-task-center-table-card" title="施工任务列表">
        <div className="worker-task-center-mobile-cards">
          {visibleRows.map((row) => (
            <article key={row.id} className="worker-task-center-card">
              <div className="worker-task-center-card-head">
                <div>
                  <span>订单</span>
                  <strong>{row.order?.orderNo ?? "订单信息待确认"}</strong>
                </div>
                <Tag color={getStatusColor(row.status)}>{getWorkerTaskStatusLabel(row.status)}</Tag>
              </div>
              <dl>
                <div>
                  <dt>预约</dt>
                  <dd>{formatSchedule(row)}</dd>
                </div>
                <div>
                  <dt>地点</dt>
                  <dd>{formatLocation(row)}</dd>
                </div>
                <div>
                  <dt>照片</dt>
                  <dd>{formatPhotoProgress(row)}</dd>
                </div>
              </dl>
              <Space wrap className="worker-task-center-actions">
                <Button icon={<EyeOutlined />} onClick={() => router.push(`/construction/tasks/${row.orderId}`)}>
                  查看执行详情
                </Button>
                {canStartTask(row.status) ? (
                  <Button
                    icon={<PlayCircleOutlined />}
                    loading={startMutation.isPending}
                    onClick={() => startMutation.mutate(row.orderId)}
                  >
                    开工
                  </Button>
                ) : null}
                {canCompleteTask(row.status) ? (
                  <Button
                    type="primary"
                    icon={<CheckOutlined />}
                    loading={completeMutation.isPending}
                    onClick={() => completeMutation.mutate(row.orderId)}
                  >
                    完工
                  </Button>
                ) : null}
              </Space>
            </article>
          ))}
          {!tasksQuery.isLoading && visibleRows.length === 0 ? (
            <div className="worker-task-center-empty">
              <Empty description="暂无施工任务" />
            </div>
          ) : null}
        </div>
        <Table<TaskRow>
          className="worker-task-center-table"
          rowKey={(row) => row.id}
          loading={tasksQuery.isLoading}
          dataSource={visibleRows}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无施工任务" /> }}
          columns={[
            {
              title: "订单号",
              dataIndex: ["order", "orderNo"],
              render: (_, row) => row.order?.orderNo ?? "订单信息待确认"
            },
            {
              title: "预约",
              key: "schedule",
              render: (_, row) => formatSchedule(row)
            },
            {
              title: "地点",
              key: "location",
              render: (_, row) => formatLocation(row)
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (status: string) => <Tag color={getStatusColor(status)}>{getWorkerTaskStatusLabel(status)}</Tag>
            },
            {
              title: "照片进度",
              key: "photos",
              render: (_, row) => formatPhotoProgress(row)
            },
            {
              title: "操作",
              key: "actions",
              render: (_, row) => (
                <Space wrap className="worker-task-center-actions">
                  <Button icon={<EyeOutlined />} onClick={() => router.push(`/construction/tasks/${row.orderId}`)}>
                    查看执行详情
                  </Button>
                  {canStartTask(row.status) ? (
                    <Button
                      icon={<PlayCircleOutlined />}
                      loading={startMutation.isPending}
                      onClick={() => startMutation.mutate(row.orderId)}
                    >
                      开工
                    </Button>
                  ) : null}
                  {canCompleteTask(row.status) ? (
                    <Button
                      type="primary"
                      icon={<CheckOutlined />}
                      loading={completeMutation.isPending}
                      onClick={() => completeMutation.mutate(row.orderId)}
                    >
                      完工
                    </Button>
                  ) : null}
                </Space>
              )
            }
          ]}
        />
      </Card>
    </div>
  );
}

function getWorkerDisplayName(user: ReturnType<typeof useAuthStore.getState>["user"]) {
  return user?.nickname || user?.username || "师傅";
}

function getStatusColor(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_CONSTRUCTION") return "processing";
  return "default";
}

function canStartTask(status: string) {
  return status === "DISPATCHED" || status === "PENDING_DISPATCH";
}

function canCompleteTask(status: string) {
  return status === "IN_CONSTRUCTION";
}

function formatSchedule(row: TaskRow) {
  return [
    row.order?.appointmentDate ? row.order.appointmentDate.slice(0, 10) : "日期待定",
    row.order?.appointmentTimeSlot ?? "时段待定"
  ].join(" ");
}

function formatLocation(row: TaskRow) {
  if (row.order?.constructionLocation === "OUTSIDE") {
    return row.order.outsideAddress ?? "外出地址待补充";
  }
  return "到店施工";
}

function formatPhotoProgress(row: TaskRow) {
  const count = row.photoCount ?? new Set((row.photos ?? []).map((photo) => photo.stage).filter(Boolean)).size;
  return `照片 ${count}/3`;
}
