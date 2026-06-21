"use client";

import { App, Button, Card, Descriptions, Empty, Form, Input, Select, Table, Tag, Upload } from "antd";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  FileImageOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { getWorkerPhotoStageLabel, getWorkerTaskStatusLabel } from "@mallbay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { constructionApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";

type PhotoStage = "BEFORE" | "DURING" | "AFTER";

type TaskRecord = {
  id: string;
  orderId: string;
  status: string;
  startedAt?: string | null;
  completedAt?: string | null;
  actualMinutes?: number | null;
  overtimeMinutes?: number | null;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    constructionLocation?: string | null;
    outsideAddress?: string | null;
  } | null;
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
};

const photoRequirements: { stage: PhotoStage; title: string; description: string; required: boolean }[] = [
  { stage: "BEFORE", title: "验车照片", description: "车头、车尾、漆面瑕疵和交车前状态", required: true },
  { stage: "BEFORE", title: "膜箱照片", description: "膜箱标签、防伪码和批次信息", required: true },
  { stage: "DURING", title: "施工过程照片", description: "裁膜、贴膜、收边等关键节点", required: false },
  { stage: "AFTER", title: "施工后照片", description: "完工外观、边角细节和交付状态", required: true }
];

export default function ConstructionTaskDetailPage() {
  const { message } = App.useApp();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [photoForm] = Form.useForm<{ stage: PhotoStage; url?: string }>();

  const taskQuery = useQuery({
    queryKey: ["construction-task-detail", storeId, params.id],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const record = ((taskQuery.data ?? []) as TaskRecord[]).find((item) => item.orderId === params.id);
  const photos = record?.photos ?? [];
  const pendingUploads = photoRequirements.filter((item) => item.required && !photos.some((photo) => photo.stage === item.stage)).length;

  const invalidateTask = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["construction-task-detail", storeId, params.id] }),
      queryClient.invalidateQueries({ queryKey: ["construction-tasks", storeId] })
    ]);
  };

  const startMutation = useMutation({
    mutationFn: () => constructionApi.startOrder(params.id),
    onSuccess: async () => {
      message.success("已开工");
      await invalidateTask();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const completeMutation = useMutation({
    mutationFn: () => constructionApi.completeOrder(params.id, new Date().toISOString()),
    onSuccess: async () => {
      message.success("已完工");
      await invalidateTask();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const uploadMutation = useMutation({
    mutationFn: (values: { stage: PhotoStage; url?: string }) => {
      if (!record) throw new Error("未找到该施工任务");
      return constructionApi.uploadPhoto(record.id, values);
    },
    onSuccess: async () => {
      message.success("施工照片已保存");
      photoForm.resetFields();
      await invalidateTask();
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page worker-task-detail-page">
      <StorePageHeader title="施工任务详情" description="在 Web 后台处理开工、照片凭证和完工提交">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/construction/tasks")}>
          返回任务列表
        </Button>
      </StorePageHeader>

      {taskQuery.isLoading ? (
        <Card>
          <div className="construction-mobile-loading">任务详情加载中...</div>
        </Card>
      ) : !record ? (
        <Card>
          <Empty description="未找到该施工任务" />
        </Card>
      ) : (
        <>
          <section className="worker-task-detail-hero">
            <div>
              <span>订单号</span>
              <h2>{record.order?.orderNo ?? "订单信息待确认"}</h2>
              <p><ClockCircleOutlined /> {formatSchedule(record)}</p>
            </div>
            <Tag color={getStatusColor(record.status)}>{getWorkerTaskStatusLabel(record.status)}</Tag>
          </section>

          <section className="worker-task-progress" aria-label="施工阶段进度">
            {getTaskSteps(record.status, pendingUploads).map((step) => (
              <div key={step.label} className={step.state === "done" ? "is-done" : step.state === "active" ? "is-active" : undefined}>
                <i>{step.state === "done" ? <CheckOutlined /> : step.index}</i>
                <span>{step.label}</span>
              </div>
            ))}
          </section>

          <section className="worker-task-detail-actions" aria-label="施工执行操作">
            {canStartTask(record.status) ? (
              <Button icon={<PlayCircleOutlined />} loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
                开始验车
              </Button>
            ) : null}
            <Button icon={<CameraOutlined />} onClick={() => document.getElementById("task-photo-upload")?.scrollIntoView({ behavior: "smooth" })}>
              上传照片
            </Button>
            {canCompleteTask(record.status) ? (
              <Button type="primary" icon={<CheckOutlined />} loading={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                提交完工
              </Button>
            ) : null}
            <Button icon={<ReloadOutlined />} loading={taskQuery.isFetching} onClick={() => taskQuery.refetch()}>
              刷新详情
            </Button>
          </section>

          <section className="worker-task-detail-grid">
            <div className="worker-task-detail-main">
              <Card className="worker-task-info-card" title="施工任务信息">
                <Descriptions column={2} bordered size="small">
                  <Descriptions.Item label="订单号">{record.order?.orderNo ?? "订单信息待确认"}</Descriptions.Item>
                  <Descriptions.Item label="任务状态">{getWorkerTaskStatusLabel(record.status)}</Descriptions.Item>
                  <Descriptions.Item label="预约时间">{formatSchedule(record)}</Descriptions.Item>
                  <Descriptions.Item label="施工地点">{formatLocation(record)}</Descriptions.Item>
                  <Descriptions.Item label="开工时间">{formatNullableDate(record.startedAt)}</Descriptions.Item>
                  <Descriptions.Item label="完工时间">{formatNullableDate(record.completedAt)}</Descriptions.Item>
                </Descriptions>
              </Card>

              <Card id="task-photo-upload" className="worker-task-photo-card" title="照片凭证">
                <Form form={photoForm} layout="vertical" onFinish={(values) => uploadMutation.mutate(values)}>
                  <div className="worker-task-photo-form">
                    <Form.Item name="stage" label="照片阶段" rules={[{ required: true, message: "请选择照片阶段" }]}>
                      <Select
                        placeholder="选择阶段"
                        options={photoRequirements.map((item) => ({ label: item.title, value: item.stage }))}
                      />
                    </Form.Item>
                    <Form.Item name="url" label="施工照片链接">
                      <Input placeholder="粘贴施工照片链接，或使用文件上传补录" />
                    </Form.Item>
                    <Button htmlType="submit" type="primary" icon={<UploadOutlined />} loading={uploadMutation.isPending}>
                      保存照片
                    </Button>
                  </div>
                </Form>

                <div className="worker-task-photo-checklist">
                  {photoRequirements.map((item) => {
                    const stagePhotos = photos.filter((photo) => photo.stage === item.stage);
                    const isComplete = stagePhotos.length > 0;
                    return (
                      <article key={item.title} className={`worker-task-photo-item${isComplete ? " is-complete" : ""}`}>
                        <div className="worker-task-photo-icon">
                          {isComplete ? <CheckOutlined /> : <FileImageOutlined />}
                        </div>
                        <div>
                          <div className="worker-task-photo-title">
                            <strong>{item.title}</strong>
                            <Tag color={isComplete ? "success" : item.required ? "error" : "default"}>
                              {isComplete ? "已上传" : item.required ? "必传" : "可选"}
                            </Tag>
                          </div>
                          <p>{item.description}</p>
                          <span>{getWorkerPhotoStageLabel(item.stage)} · {stagePhotos.length} 张</span>
                        </div>
                        <Upload
                          showUploadList={false}
                          customRequest={async ({ file, onError, onSuccess }) => {
                            try {
                              await constructionApi.uploadPhoto(record.id, { stage: item.stage, file: file as File });
                              message.success(`${item.title}已上传`);
                              await invalidateTask();
                              onSuccess?.("ok");
                            } catch (error) {
                              onError?.(error as Error);
                              message.error((error as Error).message);
                            }
                          }}
                        >
                          <Button icon={<UploadOutlined />}>上传文件</Button>
                        </Upload>
                      </article>
                    );
                  })}
                </div>
              </Card>
            </div>

            <aside className="worker-task-detail-side">
              <Card title="执行节点">
                <div className="worker-task-side-steps">
                  {getTaskSteps(record.status, pendingUploads).map((step) => (
                    <div key={step.label} className={step.state === "done" ? "is-done" : step.state === "active" ? "is-active" : undefined}>
                      <i>{step.state === "done" ? <CheckOutlined /> : step.index}</i>
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="已上传照片">
                <Table
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={photos}
                  locale={{ emptyText: <Empty description="暂无照片" /> }}
                  columns={[
                    {
                      title: "阶段",
                      dataIndex: "stage",
                      render: (stage: string) => getWorkerPhotoStageLabel(stage)
                    },
                    {
                      title: "照片",
                      dataIndex: "url",
                      render: (url: string) => url ? <a href={url} target="_blank" rel="noreferrer">查看</a> : "链接待补充"
                    }
                  ]}
                />
              </Card>
            </aside>
          </section>
        </>
      )}
    </div>
  );
}

function formatSchedule(record: TaskRecord) {
  const date = record.order?.appointmentDate ? record.order.appointmentDate.slice(0, 10) : "日期待定";
  return `${date} ${record.order?.appointmentTimeSlot ?? "时段待定"}`;
}

function formatLocation(record: TaskRecord) {
  if (record.order?.constructionLocation === "OUTSIDE") return record.order.outsideAddress ?? "外出地址待补充";
  return "到店施工";
}

function formatNullableDate(value?: string | null) {
  return value ? value.slice(0, 16).replace("T", " ") : "暂未记录";
}

function getTaskSteps(status: string, pendingUploads: number) {
  return [
    { index: 1, label: "接单", state: "done" },
    { index: 2, label: "施工前验车", state: status === "DISPATCHED" ? "active" : "done" },
    {
      index: 3,
      label: "施工中",
      state: status === "IN_CONSTRUCTION" ? "active" : status === "COMPLETED" ? "done" : "pending"
    },
    { index: 4, label: "已完成", state: status === "COMPLETED" && pendingUploads === 0 ? "done" : "pending" }
  ];
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
