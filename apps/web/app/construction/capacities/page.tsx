"use client";

import type { DailyCapacitySummary } from "@mallbay/shared";
import type { CapacityPayload } from "../../../src/lib/api";
import { App, Button, Form, Input, InputNumber, Layout, Space, Table, Typography } from "antd";
import { CalendarOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";

export default function ConstructionCapacitiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CapacityPayload>();

  const capacitiesQuery = useQuery({
    queryKey: ["construction-capacities", storeId],
    queryFn: () => constructionApi.capacities({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const saveMutation = useMutation({
    mutationFn: (values: CapacityPayload) =>
      constructionApi.upsertCapacity({
        storeId: storeId!,
        date: values.date,
        inStoreCapacity: values.inStoreCapacity,
        outsideCapacity: values.outsideCapacity,
        heatFilmCapacity: values.heatFilmCapacity,
        inspectionCapacity: values.inspectionCapacity
      }),
    onSuccess: async () => {
      message.success("施工容量已保存");
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-capacities", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <Typography.Title level={3} className="!mb-1">施工容量</Typography.Title>
            <Typography.Text type="secondary">维护每日店内、店外、玻璃膜和复检容量</Typography.Text>
          </div>
        </div>

        <Form form={form} layout="inline" className="mb-4" onFinish={(values) => saveMutation.mutate(values)}>
          <Form.Item name="date" rules={[{ required: true, message: "请选择日期" }]}>
            <Input prefix={<CalendarOutlined />} placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item name="inStoreCapacity" rules={[{ required: true, message: "店内容量" }]}>
            <InputNumber min={0} placeholder="店内" />
          </Form.Item>
          <Form.Item name="outsideCapacity" rules={[{ required: true, message: "店外容量" }]}>
            <InputNumber min={0} placeholder="店外" />
          </Form.Item>
          <Form.Item name="heatFilmCapacity" rules={[{ required: true, message: "玻璃膜容量" }]}>
            <InputNumber min={0} placeholder="玻璃膜" />
          </Form.Item>
          <Form.Item name="inspectionCapacity" rules={[{ required: true, message: "复检容量" }]}>
            <InputNumber min={0} placeholder="复检" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}>
            保存
          </Button>
        </Form>

        <Table<DailyCapacitySummary>
          rowKey="id"
          loading={capacitiesQuery.isLoading}
          dataSource={capacitiesQuery.data ?? []}
          columns={[
            { title: "日期", render: (_, row) => formatDate(row.date) },
            { title: "店内", render: (_, row) => `${row.inStoreReserved}/${row.inStoreCapacity}` },
            { title: "店外", render: (_, row) => `${row.outsideReserved}/${row.outsideCapacity}` },
            { title: "玻璃膜", render: (_, row) => `${row.heatFilmReserved}/${row.heatFilmCapacity}` },
            { title: "复检", render: (_, row) => `${row.inspectionReserved}/${row.inspectionCapacity}` },
            {
              title: "操作",
              render: (_, row) => (
                <Space>
                  <Button
                    size="small"
                    onClick={() => {
                      form.setFieldsValue({
                        date: formatDate(row.date),
                        inStoreCapacity: row.inStoreCapacity,
                        outsideCapacity: row.outsideCapacity,
                        heatFilmCapacity: row.heatFilmCapacity,
                        inspectionCapacity: row.inspectionCapacity
                      });
                    }}
                  >
                    编辑
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

function formatDate(value: string) {
  return value.slice(0, 10);
}
