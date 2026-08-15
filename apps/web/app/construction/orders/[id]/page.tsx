"use client";

import { App, Button, Card, Empty, Form, Image, Input, Modal, Select, Tag, Typography, Upload } from "antd";
import { ArrowLeftOutlined, CameraOutlined, CheckCircleOutlined, ClockCircleOutlined, UploadOutlined, UsergroupAddOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { constructionApi } from "../../../../src/lib/api";
import type { ConstructionFulfillmentView } from "../../../../src/features/construction/api";
import { clearLifecycleCommandId, getLifecycleCommandId } from "../../../../src/features/construction/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import {
  getConstructionPhotoStageLabel,
  getConstructionQualityResultLabel,
  getConstructionStatusLabel,
  getConstructionWorkerLabel
} from "../../../../src/features/construction/display";

type PhotoStage = "BEFORE" | "DURING" | "AFTER";

type ConstructionRecord = {
  id: string;
  orderId: string;
  status: string;
  qualityResult?: string | null;
  qualityNote?: string | null;
  actualMinutes?: number | null;
  overtimeMinutes?: number | null;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
    constructionLocation?: string | null;
    constructionType?: string | null;
    customer?: { name?: string | null; companyName?: string | null; contactPerson?: string | null } | null;
    vehicle?: { carPlate?: string | null; carModel?: string | null; carColor?: string | null } | null;
  } | null;
  assignments?: { workerUserId: string }[];
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
};

type ConstructionPhoto = NonNullable<ConstructionRecord["photos"]>[number];

type WorkerRow = {
  userId: string;
  skillTags?: string[];
  user?: { username?: string | null; nickname?: string | null } | null;
};

const photoStages: { value: PhotoStage; title: string; description: string }[] = [
  { value: "BEFORE", title: "施工前", description: "验车、膜箱、车况和交付前细节" },
  { value: "DURING", title: "施工中", description: "裁膜、贴膜、关键工序和异常处理" },
  { value: "AFTER", title: "施工后", description: "完工外观、边角、质检确认和交付照" }
];

const statusSteps = [
  { key: "DISPATCHED", label: "已派工" },
  { key: "IN_CONSTRUCTION", label: "施工中" },
  { key: "COMPLETED", label: "已完工" },
  { key: "PASS", label: "质检通过" }
];

export default function ConstructionOrderDetailPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [qualityForm] = Form.useForm<{ result: "PASS" | "REWORK_REQUIRED"; note?: string }>();
  const [previewPhoto, setPreviewPhoto] = useState<ConstructionPhoto | null>(null);

  const fulfillmentQuery = useQuery({
    queryKey: ["construction-order", storeId, params.id],
    queryFn: () => constructionApi.fulfillment(params.id),
    enabled: Boolean(storeId)
  });
  const workersQuery = useQuery({
    queryKey: ["construction-workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId)
  });
  const fulfillment = fulfillmentQuery.data as ConstructionFulfillmentView | undefined;
  const record: ConstructionRecord | undefined = fulfillment?.construction
    ? {
      ...fulfillment.construction,
      orderId: fulfillment.order.id,
      order: fulfillment.order
    }
    : undefined;
  const workerMap = new Map(((workersQuery.data ?? []) as WorkerRow[]).map((worker) => [worker.userId, worker]));
  const assignedWorkers = record?.assignments ?? [];
  const photos = record?.photos ?? [];
  const orderDisplayNo = record?.order?.orderNo ?? "订单待派工";
  const workspace = getConstructionWorkspace(record);

  const qualityMutation = useMutation({
    mutationFn: (values: { result: "PASS" | "REWORK_REQUIRED"; note?: string }) => {
      if (!record) {
        throw new Error("施工记录待生成，暂不能保存质检结果");
      }
      return constructionApi.qualityCheck(record.id, values, {
        commandId: getLifecycleCommandId(user!.id, storeId!, params.id, "QUALITY_CHECK"),
        expectedVersion: fulfillment!.order.lifecycleVersion
      });
    },
    onSuccess: async () => {
      clearLifecycleCommandId(user!.id, storeId!, params.id, "QUALITY_CHECK");
      message.success("质检结果已保存");
      qualityForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page construction-detail-page">
      <section className="construction-detail-shell">
        <section className="construction-detail-hero">
          <div className="construction-detail-hero-copy">
            <div className="construction-detail-hero-toolbar">
              <Button
                className="construction-detail-back"
                icon={<ArrowLeftOutlined />}
                onClick={() => router.push("/construction/assignments")}
              >
                返回施工派单
              </Button>
              <span>施工质检 & 提成审核</span>
              <Tag className="construction-detail-status-tag">{record ? getConstructionStatusLabel(record.status) : "未派工"}</Tag>
            </div>
            <h1>{record?.order?.orderNo ?? "施工记录待生成"}</h1>
            <p>
              {record
                ? `${getOrderCustomerLabel(record)} · ${getOrderVehicleLabel(record)}`
                : "跟踪施工团队、照片完整度、完工用时与质检结论，作为质保和售后追溯依据。"}
            </p>
          </div>
          <div className="construction-detail-hero-metrics">
            <div>
              <small>照片</small>
              <strong>{photos.length}</strong>
            </div>
            <div>
              <small>实际用时</small>
              <strong>{record?.actualMinutes ? `${record.actualMinutes} 分` : "-"}</strong>
            </div>
            <div>
              <small>质检</small>
              <strong>{getConstructionQualityResultLabel(record?.qualityResult)}</strong>
            </div>
          </div>
        </section>

        <section className="construction-status-steps">
          {statusSteps.map((step, index) => (
            <div key={step.key} className={`construction-status-step ${isStepActive(record, step.key) ? "active" : ""}`}>
              <i>{index + 1}</i>
              <span>{step.label}</span>
            </div>
          ))}
        </section>

        <section className="construction-detail-grid">
          <div className="construction-detail-main">
            <Card className="construction-team-panel" title="订单客户与车辆">
              <div className="construction-order-context-grid">
                <div>
                  <span>客户</span>
                  <strong>{getOrderCustomerLabel(record)}</strong>
                </div>
                <div>
                  <span>车辆</span>
                  <strong>{getOrderVehicleLabel(record)}</strong>
                </div>
                <div>
                  <span>预约时间</span>
                  <strong>{formatOrderAppointment(record)}</strong>
                </div>
              </div>
            </Card>

            <Card className="construction-team-panel" title={<><UsergroupAddOutlined /> 施工团队</>}>
              {assignedWorkers.length ? (
                <div className="construction-worker-chip-grid">
                  {assignedWorkers.map((assignment, index) => (
                    <div key={assignment.workerUserId} className="construction-worker-chip">
                      <div>{getWorkerAvatarText(workerMap.get(assignment.workerUserId), index)}</div>
                      <span>{getConstructionWorkerLabel(workerMap.get(assignment.workerUserId) ?? assignment.workerUserId)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="operation-empty">暂无施工人员</div>
              )}
            </Card>

            {workspace === "photos" ? (
              <ConstructionPhotoWorkspace
                record={record}
                photos={photos}
                onPreview={setPreviewPhoto}
                onUploadFile={async (stage, file) => {
                  if (!record) {
                    throw new Error("施工记录待生成，暂不能上传照片");
                  }
                  await constructionApi.uploadPhoto(record.id, { stage, file });
                  message.success(`${getConstructionPhotoStageLabel(stage)}已上传`);
      await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
                }}
              />
            ) : (
              <ConstructionPhotoArchive photos={photos} onPreview={setPreviewPhoto} />
            )}

            {workspace === "quality" ? (
              <ConstructionQualityWorkspace
                form={qualityForm}
                record={record}
                loading={qualityMutation.isPending}
                onSubmit={(values) => qualityMutation.mutate(values)}
              />
            ) : null}
          </div>

          <aside className="construction-detail-side">
            <ConstructionNextStepCard workspace={workspace} record={record} photos={photos} />

            <Card className="construction-audit-panel" title={<><ClockCircleOutlined /> 履约摘要</>}>
              <div className="construction-audit-row">
                <span>订单编号</span>
                <strong>{orderDisplayNo}</strong>
              </div>
              <div className="construction-audit-row">
                <span>施工人员</span>
                <strong>{assignedWorkers.length} 人</strong>
              </div>
              <div className="construction-audit-row">
                <span>超时</span>
                <strong>{record?.overtimeMinutes ?? 0} 分钟</strong>
              </div>
              <div className="construction-audit-row">
                <span>质检备注</span>
                <strong>{record?.qualityNote ?? "待填写"}</strong>
              </div>
            </Card>
          </aside>
        </section>
      </section>
      <Modal
        title={previewPhoto ? getConstructionPhotoStageLabel(previewPhoto.stage) : "施工照片"}
        open={Boolean(previewPhoto)}
        onCancel={() => setPreviewPhoto(null)}
        footer={null}
        width={780}
        centered
      >
        {previewPhoto ? (
          <div className="construction-photo-preview">
            <Image src={previewPhoto.url} alt={getConstructionPhotoStageLabel(previewPhoto.stage)} />
            <a href={previewPhoto.url} target="_blank" rel="noreferrer">
              在新窗口打开原图
            </a>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function ConstructionPhotoWorkspace({
  record,
  photos,
  onPreview,
  onUploadFile
}: {
  record?: ConstructionRecord;
  photos: ConstructionPhoto[];
  onPreview: (photo: ConstructionPhoto) => void;
  onUploadFile: (stage: PhotoStage, file: File) => Promise<void>;
}) {
  return (
    <Card className="construction-photo-board" title={<><CameraOutlined /> 当前阶段：施工照片</>}>
      <Typography.Paragraph type="secondary" className="construction-stage-copy">
        当前工单尚未进入质检，先补齐施工前、施工中和施工后照片。已上传照片可直接预览，确认照片后再进入完工与质检流转。
      </Typography.Paragraph>
      <ConstructionPhotoStageGrid photos={photos} onPreview={onPreview} onUploadFile={onUploadFile} disabled={!record} />
    </Card>
  );
}

function ConstructionPhotoArchive({
  photos,
  onPreview
}: {
  photos: ConstructionPhoto[];
  onPreview: (photo: ConstructionPhoto) => void;
}) {
  return (
    <Card className="construction-photo-board" title={<><CameraOutlined /> 施工照片归档</>}>
      <Typography.Paragraph type="secondary" className="construction-stage-copy">
        施工阶段已结束，照片作为质检和售后追溯依据保留在这里。需要补拍时请返回施工任务补录，再进行质检。
      </Typography.Paragraph>
      <ConstructionPhotoStageGrid photos={photos} onPreview={onPreview} readonly />
    </Card>
  );
}

function ConstructionPhotoStageGrid({
  photos,
  onPreview,
  onUploadFile,
  disabled,
  readonly
}: {
  photos: ConstructionPhoto[];
  onPreview: (photo: ConstructionPhoto) => void;
  onUploadFile?: (stage: PhotoStage, file: File) => Promise<void>;
  disabled?: boolean;
  readonly?: boolean;
}) {
  return (
    <div className="construction-photo-stage-grid">
      {photoStages.map((stage) => {
        const stagePhotos = photos.filter((photo) => photo.stage === stage.value);
        return (
          <div key={stage.value} className="construction-photo-stage-card">
            <div className="construction-photo-stage-head">
              <div>
                <strong>{stage.title}</strong>
                <span>{stage.description}</span>
              </div>
              <Tag>{stagePhotos.length} 张</Tag>
            </div>
            <div className="construction-photo-thumbs">
              {stagePhotos.length ? (
                stagePhotos.map((photo, index) => (
                  <button key={photo.id} type="button" onClick={() => onPreview(photo)}>
                    <span>{getConstructionPhotoStageLabel(photo.stage)} {index + 1}</span>
                    <small>{stage.title}归档照片</small>
                  </button>
                ))
              ) : (
                <span>待上传</span>
              )}
            </div>
            {!readonly ? (
              <Upload
                showUploadList={false}
                customRequest={async ({ file, onError, onSuccess }) => {
                  try {
                    if (!onUploadFile) {
                      throw new Error("施工记录待生成，暂不能上传照片");
                    }
                    await onUploadFile(stage.value, file as File);
                    onSuccess?.("ok");
                  } catch (error) {
                    onError?.(error as Error);
                  }
                }}
              >
                <Button icon={<UploadOutlined />} disabled={disabled} block>
                  上传{stage.title}
                </Button>
              </Upload>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ConstructionQualityWorkspace({
  form,
  record,
  loading,
  onSubmit
}: {
  form: ReturnType<typeof Form.useForm<{ result: "PASS" | "REWORK_REQUIRED"; note?: string }>>[0];
  record?: ConstructionRecord;
  loading: boolean;
  onSubmit: (values: { result: "PASS" | "REWORK_REQUIRED"; note?: string }) => void;
}) {
  return (
    <Card className="construction-quality-panel" title={<><CheckCircleOutlined /> 当前阶段：质检处理</>}>
      <Typography.Paragraph type="secondary">
        工单已完工，当前只处理质检结论。质检结果会作为质保和售后追溯依据，保存前请先查看上方施工照片归档。
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={onSubmit}>
        <Form.Item name="result" label="质检结果" rules={[{ required: true, message: "请选择质检结果" }]}>
          <Select
            placeholder="结果"
            options={[
              { label: "通过", value: "PASS" },
              { label: "需要返工", value: "REWORK_REQUIRED" }
            ]}
          />
        </Form.Item>
        <Form.Item name="note" label="质检备注">
          <Input.TextArea rows={5} placeholder="记录问题点、返工要求或放行说明" />
        </Form.Item>
        <Button htmlType="submit" type="primary" icon={<CheckCircleOutlined />} loading={loading} disabled={!record} block>
          保存质检
        </Button>
      </Form>
    </Card>
  );
}

function ConstructionNextStepCard({
  workspace,
  record,
  photos
}: {
  workspace: "photos" | "quality" | "summary";
  record?: ConstructionRecord;
  photos: ConstructionPhoto[];
}) {
  const requiredStages = ["BEFORE", "AFTER"];
  const missingStages = requiredStages.filter((stage) => !photos.some((photo) => photo.stage === stage));
  if (!record) {
    return (
      <Card className="construction-quality-panel" title={<><CheckCircleOutlined /> 当前处理</>}>
        <Empty description="施工记录待生成" />
      </Card>
    );
  }
  if (workspace === "photos") {
    return (
      <Card className="construction-quality-panel" title={<><CheckCircleOutlined /> 下一步</>}>
        <Typography.Paragraph type="secondary">
          当前阶段只处理施工照片。{missingStages.length ? `还需补齐 ${missingStages.map(getConstructionPhotoStageLabel).join("、")}。` : "照片已满足完工质检前置要求。"}
        </Typography.Paragraph>
        <Tag color="processing">质检将在完工后开启</Tag>
      </Card>
    );
  }
  if (workspace === "quality") {
    return (
      <Card className="construction-quality-panel" title={<><CheckCircleOutlined /> 当前处理</>}>
        <Typography.Paragraph type="secondary">
          施工已完工，请完成质检结论。若照片缺失或不清晰，先让施工人员补录后再保存质检。
        </Typography.Paragraph>
        <Tag color="warning">待质检</Tag>
      </Card>
    );
  }
  return (
    <Card className="construction-quality-panel" title={<><CheckCircleOutlined /> 质检结果</>}>
      <div className="construction-audit-row">
        <span>质检</span>
        <strong>{getConstructionQualityResultLabel(record.qualityResult)}</strong>
      </div>
      <div className="construction-audit-row">
        <span>备注</span>
        <strong>{record.qualityNote ?? "无备注"}</strong>
      </div>
    </Card>
  );
}

function isStepActive(record: ConstructionRecord | undefined, key: string) {
  if (!record) return false;
  const statusIndex = statusSteps.findIndex((step) => step.key === record.status);
  const currentIndex = statusSteps.findIndex((step) => step.key === key);
  if (key === "PASS") return record.qualityResult === "PASS";
  return statusIndex >= currentIndex && currentIndex >= 0;
}

function getConstructionWorkspace(record?: ConstructionRecord): "photos" | "quality" | "summary" {
  if (!record) return "photos";
  if (record.qualityResult) return "summary";
  if (record.status === "COMPLETED") return "quality";
  return "photos";
}

function getOrderCustomerLabel(record?: ConstructionRecord) {
  const customer = record?.order?.customer;
  return customer?.companyName ?? customer?.name ?? customer?.contactPerson ?? "客户信息待确认";
}

function getOrderVehicleLabel(record?: ConstructionRecord) {
  const vehicle = record?.order?.vehicle;
  const label = [vehicle?.carPlate, vehicle?.carModel, vehicle?.carColor].filter(Boolean).join(" / ");
  return label || "车辆信息待确认";
}

function formatOrderAppointment(record?: ConstructionRecord) {
  const date = record?.order?.appointmentDate?.slice(0, 10) ?? "日期待确认";
  return `${date} ${record?.order?.appointmentTimeSlot ?? "时段待确认"}`;
}

function getWorkerAvatarText(worker: WorkerRow | undefined, index: number) {
  return worker?.user?.nickname?.slice(0, 1) ?? worker?.user?.username?.slice(0, 1)?.toUpperCase() ?? String(index + 1);
}
