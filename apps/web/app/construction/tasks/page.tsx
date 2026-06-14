"use client";

import { App, Button, Empty, Space, Tag } from "antd";
import { CalendarOutlined, CameraOutlined, CheckOutlined, ClockCircleOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
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

export default function ConstructionTasksPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

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

  return (
    <ConstructionMobileShell
      title="我的施工任务"
      subtitle="查看派工、开工、拍照和完工"
      active="tasks"
      badgeCount={activeCount}
    >
      <section className="construction-mobile-summary">
        <div>
          <strong>{activeCount}</strong>
          <span>待处理</span>
        </div>
        <div>
          <strong>{rows.length}</strong>
          <span>全部任务</span>
        </div>
      </section>

      {tasksQuery.isLoading ? (
        <div className="construction-mobile-loading">任务加载中...</div>
      ) : rows.length === 0 ? (
        <Empty description="暂无施工任务" />
      ) : (
        <div className="construction-task-list">
          {rows.map((row) => (
            <article key={row.id} className="construction-task-card">
              <div className="construction-task-card-header">
                <div>
                  <span className="construction-task-label">订单</span>
                  <h2>{row.order?.orderNo ?? "订单未加载"}</h2>
                </div>
                <Tag color={getStatusColor(row.status)}>{getConstructionStatusLabel(row.status)}</Tag>
              </div>
              <div className="construction-task-meta">
                <span><CalendarOutlined /> {formatDate(row.order?.appointmentDate)}</span>
                <span><ClockCircleOutlined /> {row.order?.appointmentTimeSlot ?? "时段待定"}</span>
              </div>
              <p className="construction-task-location">
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

function getStatusColor(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_CONSTRUCTION") return "processing";
  return "default";
}

function formatDate(value?: string | null) {
  if (!value) return "日期待定";
  return value.slice(0, 10);
}
