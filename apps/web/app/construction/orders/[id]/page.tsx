"use client";

import { App, Button, Card, Form, Input, Select, Tag, Typography, Upload } from "antd";
import { ArrowLeftOutlined, CameraOutlined, CheckCircleOutlined, ClockCircleOutlined, UploadOutlined, UsergroupAddOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { constructionApi } from "../../../../src/lib/api";
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
  overtimeMinutes?: number;
  order?: { orderNo?: string | null } | null;
  assignments?: { workerUserId: string }[];
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
};

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
  const [photoForm] = Form.useForm<{ stage: PhotoStage; url?: string }>();
  const [qualityForm] = Form.useForm<{ result: "PASS" | "REWORK_REQUIRED"; note?: string }>();

  const recordsQuery = useQuery({
    queryKey: ["construction-order", storeId, params.id],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });
  const workersQuery = useQuery({
    queryKey: ["construction-workers", storeId],
    queryFn: () => constructionApi.workers(storeId!),
    enabled: Boolean(storeId)
  });
  const record = ((recordsQuery.data ?? []) as ConstructionRecord[]).find((item) => item.orderId === params.id);
  const workerMap = new Map(((workersQuery.data ?? []) as WorkerRow[]).map((worker) => [worker.userId, worker]));
  const assignedWorkers = record?.assignments ?? [];
  const photos = record?.photos ?? [];
  const orderDisplayNo = record?.order?.orderNo ?? "订单待派工";

  const uploadMutation = useMutation({
    mutationFn: (values: { stage: PhotoStage; url?: string }) => {
      if (!record) {
        throw new Error("施工记录待生成，暂不能上传照片");
      }
      return constructionApi.uploadPhoto(record.id, values);
    },
    onSuccess: async () => {
      message.success("施工照片已保存");
      photoForm.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const qualityMutation = useMutation({
    mutationFn: (values: { result: "PASS" | "REWORK_REQUIRED"; note?: string }) => {
      if (!record) {
        throw new Error("施工记录待生成，暂不能保存质检结果");
      }
      return constructionApi.qualityCheck(record.id, values);
    },
    onSuccess: async () => {
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
            <Button
              className="construction-detail-back"
              icon={<ArrowLeftOutlined />}
              onClick={() => router.push("/construction/assignments")}
            >
              返回施工派单
            </Button>
            <span>施工质检 & 提成审核</span>
            <h1>{record?.order?.orderNo ?? "施工记录待生成"}</h1>
            <p>跟踪施工团队、照片完整度、完工用时与质检结论，作为质保和售后追溯依据。</p>
          </div>
          <Tag className="construction-detail-status-tag">{record ? getConstructionStatusLabel(record.status) : "未派工"}</Tag>
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

            <Card className="construction-photo-board" title={<><CameraOutlined /> 施工照片</>}>
              <Form form={photoForm} layout="vertical" onFinish={(values) => uploadMutation.mutate(values)}>
                <div className="construction-photo-form-row">
                  <Form.Item name="stage" label="照片阶段" rules={[{ required: true, message: "请选择阶段" }]}>
                    <Select
                      placeholder="阶段"
                      options={photoStages.map((stage) => ({ label: stage.title, value: stage.value }))}
                    />
                  </Form.Item>
                  <Form.Item name="url" label="施工照片链接">
                    <Input placeholder="粘贴施工照片链接，或在下方阶段卡直接上传" />
                  </Form.Item>
                  <Button htmlType="submit" type="primary" icon={<UploadOutlined />} disabled={!record}>
                    保存照片
                  </Button>
                </div>
              </Form>

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
                          stagePhotos.slice(0, 4).map((photo) => (
                            <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                              {getConstructionPhotoStageLabel(photo.stage)}
                              <small>{getConstructionWorkerLabel(workerMap.get(photo.uploadedById) ?? photo.uploadedById)}</small>
                            </a>
                          ))
                        ) : (
                          <span>待上传</span>
                        )}
                      </div>
                      <Upload
                        showUploadList={false}
                        customRequest={async ({ file, onError, onSuccess }) => {
                          try {
                            if (!record) {
                              throw new Error("施工记录待生成，暂不能上传照片");
                            }
                            await constructionApi.uploadPhoto(record.id, { stage: stage.value, file: file as File });
                            message.success(`${stage.title}照片已上传`);
                            await queryClient.invalidateQueries({ queryKey: ["construction-order", storeId, params.id] });
                            onSuccess?.("ok");
                          } catch (error) {
                            onError?.(error as Error);
                            message.error((error as Error).message);
                          }
                        }}
                      >
                        <Button icon={<UploadOutlined />} disabled={!record} block>
                          上传{stage.title}
                        </Button>
                      </Upload>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <aside className="construction-detail-side">
            <Card className="construction-quality-panel" title={<><CheckCircleOutlined /> 质检处理</>}>
              <Typography.Paragraph type="secondary">
                质检结果会作为质保和售后追溯依据，保存前请确认施工前、施工后照片已经补齐。
              </Typography.Paragraph>
              <Form form={qualityForm} layout="vertical" onFinish={(values) => qualityMutation.mutate(values)}>
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
                <Button htmlType="submit" type="primary" icon={<CheckCircleOutlined />} disabled={!record} block>
                  保存质检
                </Button>
              </Form>
            </Card>

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
    </div>
  );
}

function isStepActive(record: ConstructionRecord | undefined, key: string) {
  if (!record) return false;
  const statusIndex = statusSteps.findIndex((step) => step.key === record.status);
  const currentIndex = statusSteps.findIndex((step) => step.key === key);
  if (key === "PASS") return record.qualityResult === "PASS";
  return statusIndex >= currentIndex && currentIndex >= 0;
}

function getWorkerAvatarText(worker: WorkerRow | undefined, index: number) {
  return worker?.user?.nickname?.slice(0, 1) ?? worker?.user?.username?.slice(0, 1)?.toUpperCase() ?? String(index + 1);
}
