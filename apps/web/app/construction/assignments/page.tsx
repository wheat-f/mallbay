"use client";

import { App, Button, Form, Layout, Modal, Select, Space, Table, Tag, Typography } from "antd";
import { TeamOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { constructionApi, orderApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";

type OrderRow = {
  id: string;
  orderNo: string;
  status: string;
  customer?: { name?: string | null; companyName?: string | null };
};

type WorkerRow = {
  userId: string;
  skillTags?: string[];
  isActive: boolean;
};

type ConstructionRecordRow = {
  id: string;
  orderId: string;
  status: string;
  order?: { orderNo: string };
  assignments?: { workerUserId: string }[];
};

const STATUS_LABEL: Record<string, string> = {
  DISPATCHED: "已派工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完工"
};

export default function ConstructionAssignmentsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [assigning, setAssigning] = useState<OrderRow | null>(null);
  const [form] = Form.useForm<{ workerUserIds: string[] }>();

  const pendingOrdersQuery = useQuery({
    queryKey: ["orders", storeId, "PENDING_DISPATCH"],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "PENDING_DISPATCH", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });

  const recordsQuery = useQuery({
    queryKey: ["construction-assignments", storeId],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const workersQuery = useQuery({
    queryKey: ["construction-workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId)
  });

  const assignMutation = useMutation({
    mutationFn: (values: { workerUserIds: string[] }) => constructionApi.assignOrder(assigning!.id, values),
    onSuccess: async () => {
      message.success("派工已保存");
      setAssigning(null);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["orders", storeId, "PENDING_DISPATCH"] });
      await queryClient.invalidateQueries({ queryKey: ["construction-assignments", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const pendingRows = (pendingOrdersQuery.data?.items ?? []) as OrderRow[];
  const records = (recordsQuery.data ?? []) as ConstructionRecordRow[];
  const workers = ((workersQuery.data ?? []) as WorkerRow[]).filter((worker) => worker.isActive);

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <Typography.Title level={3} className="!mb-1">施工派工</Typography.Title>
        <Typography.Text type="secondary">处理待派工订单并查看施工履约进度</Typography.Text>

        <Typography.Title level={4} className="!mt-6">待派工订单</Typography.Title>
        <Table<OrderRow>
          rowKey="id"
          loading={pendingOrdersQuery.isLoading}
          dataSource={pendingRows}
          columns={[
            { title: "订单号", dataIndex: "orderNo" },
            { title: "客户", render: (_, row) => row.customer?.companyName ?? row.customer?.name ?? "-" },
            { title: "状态", render: () => <Tag color="warning">待派工</Tag> },
            {
              title: "操作",
              render: (_, row) => (
                <Button icon={<TeamOutlined />} size="small" onClick={() => setAssigning(row)}>
                  派工
                </Button>
              )
            }
          ]}
        />

        <Typography.Title level={4} className="!mt-6">施工记录</Typography.Title>
        <Table<ConstructionRecordRow>
          rowKey="id"
          loading={recordsQuery.isLoading}
          dataSource={records}
          columns={[
            { title: "订单号", render: (_, row) => row.order?.orderNo ?? row.orderId },
            { title: "状态", render: (_, row) => <Tag>{STATUS_LABEL[row.status] ?? row.status}</Tag> },
            { title: "人员", render: (_, row) => row.assignments?.map((item) => item.workerUserId).join("、") ?? "-" },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button size="small" onClick={() => router.push(`/construction/orders/${row.orderId}`)}>
                    详情
                  </Button>
                </Space>
              )
            }
          ]}
        />

        <Modal
          open={Boolean(assigning)}
          title="施工派工"
          onCancel={() => setAssigning(null)}
          onOk={() => form.submit()}
          confirmLoading={assignMutation.isPending}
          destroyOnHidden
        >
          <Form form={form} layout="vertical" onFinish={(values) => assignMutation.mutate(values)}>
            <Form.Item name="workerUserIds" label="施工人员" rules={[{ required: true, message: "请选择施工人员" }]}>
              <Select
                mode="multiple"
                maxCount={3}
                options={workers.map((worker) => ({
                  value: worker.userId,
                  label: `${worker.userId}${worker.skillTags?.length ? ` · ${worker.skillTags.join("/")}` : ""}`
                }))}
              />
            </Form.Item>
          </Form>
        </Modal>
      </Layout.Content>
    </Layout>
  );
}
