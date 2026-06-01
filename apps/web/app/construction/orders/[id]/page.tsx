"use client";

import { App, Button, Form, Input, Layout, Select, Space, Table, Tag, Typography, Upload } from "antd";
import { CheckCircleOutlined, UploadOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { constructionApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";

type ConstructionRecord = {
  id: string;
  orderId: string;
  status: string;
  qualityResult?: string | null;
  qualityNote?: string | null;
  actualMinutes?: number | null;
  overtimeMinutes?: number;
  assignments?: { workerUserId: string }[];
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
};

export default function ConstructionOrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [photoForm] = Form.useForm<{ stage: "BEFORE" | "DURING" | "AFTER"; url?: string }>();
  const [qualityForm] = Form.useForm<{ result: "PASS" | "REWORK_REQUIRED"; note?: string }>();

  const recordsQuery = useQuery({
    queryKey: ["construction-order", storeId, params.id],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const record = ((recordsQuery.data ?? []) as ConstructionRecord[]).find((item) => item.orderId === params.id);

  const uploadMutation = useMutation({
    mutationFn: (values: { stage: "BEFORE" | "DURING" | "AFTER"; url?: string }) =>
      constructionApi.uploadPhoto(record!.id, values),
    onSuccess: async () => {
      message.success("施工照片已保存");
      photoForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const qualityMutation = useMutation({
    mutationFn: (values: { result: "PASS" | "REWORK_REQUIRED"; note?: string }) =>
      constructionApi.qualityCheck(record!.id, values),
    onSuccess: async () => {
      message.success("质检结果已保存");
      qualityForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <Typography.Title level={3} className="!mb-1">施工详情</Typography.Title>
        <Typography.Text type="secondary">查看施工人员、照片、完工用时和质检结果</Typography.Text>

        <div className="mt-4 mb-6">
          <Space wrap>
            <Tag>{record?.status ?? "未派工"}</Tag>
            <Tag>订单：{params.id}</Tag>
            <Tag>人员：{record?.assignments?.map((item) => item.workerUserId).join("、") || "-"}</Tag>
            <Tag>用时：{record?.actualMinutes ?? "-"} 分钟</Tag>
            <Tag>超时：{record?.overtimeMinutes ?? 0} 分钟</Tag>
            <Tag>质检：{record?.qualityResult ?? "-"}</Tag>
          </Space>
        </div>

        <Typography.Title level={4}>施工照片</Typography.Title>
        <Form form={photoForm} layout="inline" className="mb-4" onFinish={(values) => uploadMutation.mutate(values)}>
          <Form.Item name="stage" rules={[{ required: true, message: "请选择阶段" }]}>
            <Select
              placeholder="阶段"
              style={{ width: 140 }}
              options={[
                { label: "施工前", value: "BEFORE" },
                { label: "施工中", value: "DURING" },
                { label: "施工后", value: "AFTER" }
              ]}
            />
          </Form.Item>
          <Form.Item name="url">
            <Input placeholder="图片 URL" style={{ width: 360 }} />
          </Form.Item>
          <Button htmlType="submit" type="primary" icon={<UploadOutlined />} disabled={!record}>
            保存照片
          </Button>
        </Form>
        <Upload
          showUploadList={false}
          customRequest={async ({ file, onError, onSuccess }) => {
            try {
              const stage = photoForm.getFieldValue("stage");
              if (!record || !stage) {
                throw new Error("请选择阶段");
              }
              await constructionApi.uploadPhoto(record.id, { stage, file: file as File });
              message.success("施工照片已上传");
              await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
              onSuccess?.("ok");
            } catch (error) {
              onError?.(error as Error);
              message.error((error as Error).message);
            }
          }}
        >
          <Button icon={<UploadOutlined />} disabled={!record}>上传文件</Button>
        </Upload>
        <Table
          className="mt-4"
          rowKey="id"
          dataSource={record?.photos ?? []}
          columns={[
            { title: "阶段", dataIndex: "stage" },
            { title: "URL", dataIndex: "url" },
            { title: "上传人", dataIndex: "uploadedById" }
          ]}
        />

        <Typography.Title level={4} className="!mt-6">质检</Typography.Title>
        <Form form={qualityForm} layout="inline" onFinish={(values) => qualityMutation.mutate(values)}>
          <Form.Item name="result" rules={[{ required: true, message: "请选择质检结果" }]}>
            <Select
              placeholder="结果"
              style={{ width: 180 }}
              options={[
                { label: "通过", value: "PASS" },
                { label: "需要返工", value: "REWORK_REQUIRED" }
              ]}
            />
          </Form.Item>
          <Form.Item name="note">
            <Input placeholder="备注" style={{ width: 360 }} />
          </Form.Item>
          <Button htmlType="submit" type="primary" icon={<CheckCircleOutlined />} disabled={!record}>
            保存质检
          </Button>
        </Form>
      </Layout.Content>
    </Layout>
  );
}
