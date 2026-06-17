"use client";

import { App, Button, Empty, Form, Input, Select, Tag, Upload } from "antd";
import {
  ArrowLeftOutlined,
  CameraOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  CloudSyncOutlined,
  EnvironmentOutlined,
  PlayCircleOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { constructionApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import {
  getConstructionPhotoStageLabel,
  getConstructionStatusLabel
} from "../../../../src/features/construction/display";
import { ConstructionMobileShell } from "../../../../src/features/construction/mobile-shell";

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

export default function ConstructionMobileTaskDetailPage() {
  const { message } = App.useApp();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [photoForm] = Form.useForm<{ stage: PhotoStage; url?: string }>();

  const taskQuery = useQuery({
    queryKey: ["construction-mobile-task", storeId, params.id],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const record = ((taskQuery.data ?? []) as TaskRecord[]).find((item) => item.orderId === params.id);
  const photos = record?.photos ?? [];
  const pendingUploads = photoRequirements.filter((item) => item.required && !photos.some((photo) => photo.stage === item.stage)).length;

  const invalidateTask = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["construction-mobile-task", storeId, params.id] }),
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
    <ConstructionMobileShell
      title="施工任务详情"
      subtitle="按节点拍照、开工、完工并同步离线队列"
      active="tasks"
      badgeCount={pendingUploads}
      desktopHref={`/construction/orders/${params.id}`}
    >
      <section className="construction-mobile-task-detail">
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/construction/tasks")}>
          返回任务
        </Button>

        {taskQuery.isLoading ? (
          <div className="construction-mobile-loading">任务详情加载中...</div>
        ) : !record ? (
          <Empty description="未找到该施工任务" />
        ) : (
          <>
            <section className="worker-task-detail-hero">
              <div>
                <span>订单号</span>
                <h2>{record.order?.orderNo ?? "订单信息待确认"}</h2>
                <p><ClockCircleOutlined /> {formatSchedule(record)}</p>
              </div>
              <Tag>{getConstructionStatusLabel(record.status)}</Tag>
            </section>

            <section className="worker-task-progress" aria-label="施工阶段进度">
              {getTaskSteps(record.status, pendingUploads).map((step) => (
                <div key={step.label} className={step.state === "done" ? "is-done" : step.state === "active" ? "is-active" : undefined}>
                  <i>{step.state === "done" ? <CheckOutlined /> : step.index}</i>
                  <span>{step.label}</span>
                </div>
              ))}
            </section>

            <section className="construction-mobile-panel construction-task-detail-card worker-task-info-card">
              <div className="construction-task-card-header">
                <div>
                  <span className="construction-task-label">施工任务信息</span>
                  <h2>{formatLocation(record)}</h2>
                </div>
                <Tag color={getStatusColor(record.status)}>{getConstructionStatusLabel(record.status)}</Tag>
              </div>
              <div className="construction-task-meta">
                <span><ClockCircleOutlined /> {formatSchedule(record)}</span>
                <span><EnvironmentOutlined /> {formatLocation(record)}</span>
              </div>
            </section>

            <section className="construction-mobile-panel">
              <div className="construction-mobile-section-head">
                <div>
                  <h2>照片清单</h2>
                  <p>{pendingUploads} 项必传照片待补齐</p>
                </div>
                <Button icon={<CloudSyncOutlined />} href="/construction/offline">
                  离线队列
                </Button>
              </div>

              <Form form={photoForm} layout="vertical" onFinish={(values) => uploadMutation.mutate(values)}>
                <div id="task-photo-upload" className="construction-mobile-upload-form">
                  <Form.Item name="stage" label="照片阶段" rules={[{ required: true, message: "请选择照片阶段" }]}>
                    <Select
                      placeholder="选择阶段"
                      options={photoRequirements.map((item) => ({ label: item.title, value: item.stage }))}
                    />
                  </Form.Item>
                  <Form.Item name="url" label="施工照片链接">
                    <Input placeholder="粘贴施工照片链接，或使用下方拍照上传" />
                  </Form.Item>
                  <Button htmlType="submit" type="primary" icon={<UploadOutlined />} loading={uploadMutation.isPending} block>
                    保存照片
                  </Button>
                </div>
              </Form>

              <div className="construction-mobile-photo-checklist">
                {photoRequirements.map((item) => {
                  const stagePhotos = photos.filter((photo) => photo.stage === item.stage);
                  const isComplete = stagePhotos.length > 0;
                  return (
                    <article key={item.title} className={`construction-mobile-photo-item${isComplete ? " is-complete" : ""}`}>
                      <div className="construction-mobile-photo-icon">
                        {isComplete ? <CheckOutlined /> : <CameraOutlined />}
                      </div>
                      <div>
                        <div className="construction-mobile-photo-title">
                          <strong>{item.title}</strong>
                          <Tag color={isComplete ? "success" : item.required ? "error" : "default"}>
                            {isComplete ? "已上传" : item.required ? "必传" : "可选"}
                          </Tag>
                        </div>
                        <p>{item.description}</p>
                        <span>{getConstructionPhotoStageLabel(item.stage)} · {stagePhotos.length} 张</span>
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
                        <Button icon={<CameraOutlined />}>拍照</Button>
                      </Upload>
                    </article>
                  );
                })}
              </div>
            </section>

            <div className="worker-task-sticky-actions">
              <Button icon={<PlayCircleOutlined />} onClick={() => startMutation.mutate()} loading={startMutation.isPending}>
                开始验车
              </Button>
              <Button icon={<CameraOutlined />} onClick={() => document.getElementById("task-photo-upload")?.scrollIntoView({ behavior: "smooth" })}>
                上传照片
              </Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => completeMutation.mutate()}
                loading={completeMutation.isPending}
              >
                提交完工
              </Button>
            </div>
          </>
        )}
      </section>
    </ConstructionMobileShell>
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
