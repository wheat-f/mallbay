"use client";

import { App, Button, Layout, Space, Table, Tag, Typography } from "antd";
import { CameraOutlined, CheckOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { getConstructionStatusLabel } from "../../../src/features/construction/display";

type TaskRow = {
  id: string;
  orderId: string;
  status: string;
  order?: { orderNo: string };
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

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader title="我的施工任务" description="查看已派工任务并推进开工、拍照和完工" />
        <Table<TaskRow>
          className="mt-4"
          rowKey="id"
          loading={tasksQuery.isLoading}
          dataSource={rows}
          columns={[
            { title: "订单号", render: (_, row) => row.order?.orderNo ?? "订单未加载" },
            { title: "状态", render: (_, row) => <Tag>{getConstructionStatusLabel(row.status)}</Tag> },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button size="small" icon={<PlayCircleOutlined />} onClick={() => startMutation.mutate(row.orderId)}>
                    开工
                  </Button>
                  <Button size="small" icon={<CameraOutlined />} onClick={() => router.push(`/construction/orders/${row.orderId}`)}>
                    照片
                  </Button>
                  <Button size="small" icon={<CheckOutlined />} onClick={() => completeMutation.mutate(row.orderId)}>
                    完工
                  </Button>
                </Space>
              )
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
