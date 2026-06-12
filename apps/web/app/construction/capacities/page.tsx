"use client";

import type { DailyCapacitySummary } from "@mallbay/shared";
import { App, Button, Card, DatePicker, Form, InputNumber, Layout, Space, Table, Typography } from "antd";
import { ArrowLeftOutlined, SaveOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import {
  buildCapacityPayload,
  toCapacityDatePickerValue,
  type CapacityFormValues
} from "../../../src/features/construction/capacity-form";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

export default function ConstructionCapacitiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CapacityFormValues>();
  const [returnTo, setReturnTo] = useState<string>();

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const dateFromQuery = searchParams.get("date");
    setReturnTo(getSafeReturnTo(searchParams.get("returnTo")));
    if (!dateFromQuery) return;
    form.setFieldValue("date", toCapacityDatePickerValue(dateFromQuery));
  }, [form]);

  const capacitiesQuery = useQuery({
    queryKey: ["construction-capacities", storeId],
    queryFn: () => constructionApi.capacities({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const saveMutation = useMutation({
    mutationFn: (values: CapacityFormValues) => constructionApi.upsertCapacity(buildCapacityPayload(storeId!, values)),
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
        <StorePageHeader title="施工容量" description="维护每日店内、店外、玻璃膜和复检容量">
          {returnTo ? (
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push(returnTo)}>
              返回订单
            </Button>
          ) : null}
        </StorePageHeader>

        <div className="capacity-page-layout">
          <Card
            className="capacity-editor-card"
            title="设置每日容量"
            extra={<Typography.Text type="secondary">从订单页跳转会自动带入预约日期</Typography.Text>}
          >
            <Form
              form={form}
              layout="vertical"
              className="capacity-form-grid"
              onFinish={(values) => saveMutation.mutate(values)}
            >
              <div className="capacity-date-panel">
                <Form.Item label="日期" name="date" rules={[{ required: true, message: "请选择日期" }]}>
                  <DatePicker
                    allowClear
                    className="w-full"
                    format="YYYY-MM-DD"
                    getPopupContainer={() => document.body}
                    placeholder="请选择日期"
                    presets={[{ label: "今天", value: dayjs() }]}
                  />
                </Form.Item>
              </div>
              <div className="capacity-number-grid">
                <Form.Item label="店内容量" name="inStoreCapacity" rules={[{ required: true, message: "店内容量" }]}>
                  <InputNumber className="w-full" min={0} placeholder="店内" />
                </Form.Item>
                <Form.Item label="店外容量" name="outsideCapacity" rules={[{ required: true, message: "店外容量" }]}>
                  <InputNumber className="w-full" min={0} placeholder="店外" />
                </Form.Item>
                <Form.Item label="玻璃膜容量" name="heatFilmCapacity" rules={[{ required: true, message: "玻璃膜容量" }]}>
                  <InputNumber className="w-full" min={0} placeholder="玻璃膜" />
                </Form.Item>
                <Form.Item label="复检容量" name="inspectionCapacity" rules={[{ required: true, message: "复检容量" }]}>
                  <InputNumber className="w-full" min={0} placeholder="复检" />
                </Form.Item>
              </div>
              <div className="capacity-form-actions">
                <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saveMutation.isPending}>
                  保存容量
                </Button>
              </div>
            </Form>
          </Card>

          <Card className="capacity-list-card" title="已维护容量">
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
                            date: toCapacityDatePickerValue(formatDate(row.date)),
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
          </Card>
        </div>
      </Layout.Content>
    </Layout>
  );
}

function formatDate(value: string) {
  return value.slice(0, 10);
}

function getSafeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return undefined;
  }
  return value;
}
