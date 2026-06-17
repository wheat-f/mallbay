"use client";

import { App, Button, Empty, Space, Tag } from "antd";
import {
  CalendarOutlined,
  CameraOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { getConstructionStatusLabel } from "../../../src/features/construction/display";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";

type TaskRow = {
  id: string;
  orderId: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    constructionLocation?: string | null;
    outsideAddress?: string | null;
  };
};

type TaskSegmentKey = "today" | "pending" | "active" | "completed";

export default function ConstructionTasksPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [activeSegment, setActiveSegment] = useState<TaskSegmentKey>("today");

  const tasksQuery = useQuery({
    queryKey: ["construction-tasks", storeId],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
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

  const rows = (tasksQuery.data ?? []) as TaskRow[];
  const activeCount = rows.filter((row) => row.status !== "COMPLETED").length;
  const todayKey = new Date().toISOString().slice(0, 10);
  const pendingRows = rows.filter((row) => row.status === "DISPATCHED" || row.status === "PENDING_DISPATCH");
  const activeRows = rows.filter((row) => row.status === "IN_CONSTRUCTION");
  const completedRows = rows.filter((row) => row.status === "COMPLETED");
  const todayRows = rows.filter((row) => row.order?.appointmentDate?.slice(0, 10) === todayKey);
  const taskSegments = useMemo(
    () => [
      { key: "today" as const, label: "今日任务", count: todayRows.length || activeCount },
      { key: "pending" as const, label: "待接单", count: pendingRows.length },
      { key: "active" as const, label: "施工中", count: activeRows.length },
      { key: "completed" as const, label: "已完成", count: completedRows.length }
    ],
    [activeCount, activeRows.length, completedRows.length, pendingRows.length, todayRows.length]
  );
  const visibleRows = getVisibleRows(activeSegment, rows, todayRows, pendingRows, activeRows, completedRows);

  return (
    <ConstructionMobileShell
      title="我的施工任务"
      subtitle="查看派工、开工、拍照和完工"
      active="tasks"
      badgeCount={activeCount}
      desktopHref="/construction/assignments"
    >
      <section className="worker-task-status-hero">
        <div>
          <h2>{getWorkerDisplayName(user)}，你好</h2>
          <p>今天有 {activeCount} 个待办任务</p>
        </div>
        <span>
          <i />
          在线
        </span>
      </section>

      <nav className="construction-task-segments" aria-label="施工任务状态筛选">
        {taskSegments.map((segment) => (
          <button
            key={segment.key}
            className={activeSegment === segment.key ? "is-active" : undefined}
            type="button"
            onClick={() => setActiveSegment(segment.key)}
          >
            {segment.label}
            {segment.key !== "completed" ? <em>{segment.count}</em> : null}
          </button>
        ))}
      </nav>

      {tasksQuery.isLoading ? (
        <div className="construction-mobile-loading">任务加载中...</div>
      ) : visibleRows.length === 0 ? (
        <div className="worker-task-empty-card">
          <Empty description="暂无施工任务" />
        </div>
      ) : (
        <div className="construction-task-list">
          {visibleRows.map((row) => (
            <article key={row.id} className="construction-task-card">
              <div className="construction-task-card-header">
                <div>
                  <span className="construction-task-label">订单</span>
                  <h2>{row.order?.orderNo ?? "订单信息待确认"}</h2>
                </div>
                <Tag color={getStatusColor(row.status)}>{getConstructionStatusLabel(row.status)}</Tag>
              </div>
              <div className="construction-task-meta">
                <span><CalendarOutlined /> {formatDate(row.order?.appointmentDate)}</span>
                <span><ClockCircleOutlined /> {row.order?.appointmentTimeSlot ?? "时段待定"}</span>
              </div>
              <p className="construction-task-location">
                <EnvironmentOutlined />
                {row.order?.constructionLocation === "OUTSIDE"
                  ? row.order.outsideAddress ?? "外出地址待补充"
                  : "到店施工"}
              </p>
              <Space className="construction-task-actions" wrap>
                <Button icon={<PlayCircleOutlined />} onClick={() => startMutation.mutate(row.orderId)}>
                  开工
                </Button>
                <Button icon={<CameraOutlined />} onClick={() => router.push(`/construction/tasks/${row.orderId}`)}>
                  拍照
                </Button>
                <Button type="primary" icon={<CheckOutlined />} onClick={() => completeMutation.mutate(row.orderId)}>
                  完工
                </Button>
              </Space>
            </article>
          ))}
        </div>
      )}
    </ConstructionMobileShell>
  );
}

function getVisibleRows(
  activeSegment: TaskSegmentKey,
  rows: TaskRow[],
  todayRows: TaskRow[],
  pendingRows: TaskRow[],
  activeRows: TaskRow[],
  completedRows: TaskRow[]
) {
  if (activeSegment === "pending") return pendingRows;
  if (activeSegment === "active") return activeRows;
  if (activeSegment === "completed") return completedRows;
  return todayRows.length > 0 ? todayRows : rows;
}

function getWorkerDisplayName(user: ReturnType<typeof useAuthStore.getState>["user"]) {
  return user?.nickname || user?.username || "师傅";
}

function getStatusColor(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_CONSTRUCTION") return "processing";
  return "default";
}

function formatDate(value?: string | null) {
  if (!value) return "日期待定";
  return value.slice(0, 10);
}
