"use client";

import { useState } from "react";
import { App, Button, Card, Descriptions, Empty, Image, Input, InputNumber, Modal, Select, Space, Table, Tag, Upload } from "antd";
import {
  ArrowLeftOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  FileImageOutlined,
  InboxOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { getWorkerPhotoStageLabel, getWorkerTaskStatusLabel } from "@mallbay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import type { ConstructionMaterialItem, ConstructionOrderMaterials, ConstructionFulfillmentView } from "../../../../src/features/construction/api";
import { clearLifecycleCommandId, getLifecycleCommandId } from "../../../../src/features/construction/api";
import { constructionApi } from "../../../../src/lib/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";
import { dictionaryApi, type DictionaryItem } from "../../../../src/features/settings/api";
import { getProductUnitLabel } from "../../../../src/features/products/display";

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

type TaskPhoto = NonNullable<TaskRecord["photos"]>[number];

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
  const [previewPhoto, setPreviewPhoto] = useState<TaskPhoto | null>(null);
  const [declaredMinutes, setDeclaredMinutes] = useState<number>();
  const [varianceReasonCode, setVarianceReasonCode] = useState<string>();
  const [varianceReasonText, setVarianceReasonText] = useState("");

  const taskQuery = useQuery({
    queryKey: ["construction-task-detail", storeId, params.id],
    queryFn: () => constructionApi.fulfillment(params.id),
    enabled: Boolean(storeId)
  });

  const fulfillment = taskQuery.data as ConstructionFulfillmentView | undefined;
  const record: TaskRecord | undefined = fulfillment?.construction
    ? {
      ...fulfillment.construction,
      orderId: fulfillment.order.id,
      order: fulfillment.order
    }
    : undefined;
  const photos = record?.photos ?? [];
  const pendingUploads = photoRequirements.filter((item) => item.required && !photos.some((photo) => photo.stage === item.stage)).length;

  const materialsQuery = useQuery({
    queryKey: ["construction-order-materials", params.id],
    queryFn: () => constructionApi.orderMaterials(params.id),
    enabled: Boolean(record)
  });
  const declarationQuery = useQuery({
    queryKey: ["construction-work-cost-declaration", record?.id],
    queryFn: () => constructionApi.workCostDeclaration(record!.id),
    enabled: Boolean(record?.id && record.status === "COMPLETED")
  });
  const dictionariesQuery = useQuery({
    queryKey: ["store-dictionaries", storeId],
    queryFn: () => dictionaryApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const varianceReasonOptions = getDictionaryOptions(dictionariesQuery.data ?? [], "CONSTRUCTION_TIME_VARIANCE_REASON");

  const materialData = materialsQuery.data;
  const pendingAllocationIds = (materialData?.materials ?? []).flatMap((item) =>
    item.batches.filter((batch) => !batch.pickedUp).map((batch) => batch.allocationId)
  );
  const hasLockedMaterials = (materialData?.summary.allocatedBatches ?? 0) > 0;
  const materialPickupState = getMaterialPickupState(materialData, materialsQuery.isLoading, pendingAllocationIds.length);
  const completeCapability = fulfillment?.lifecycle.capabilities.completeConstruction;
  const completeBlockReason = getAuthoritativeCompleteBlockReason(completeCapability, pendingUploads, materialPickupState);

  const invalidateTask = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["construction-task-detail", storeId, params.id] }),
      queryClient.invalidateQueries({ queryKey: ["construction-tasks", storeId] }),
      queryClient.invalidateQueries({ queryKey: ["construction-order-materials", params.id] })
    ]);
  };

  const declareWorkMutation = useMutation({
    mutationFn: () => constructionApi.declareCostWork(declarationQuery.data!.id, {
      declaredWorkMinutes: declaredMinutes ?? declarationQuery.data!.declaredMinutes ?? declarationQuery.data!.standardMinutes,
      ...(varianceReasonCode ? { varianceReasonCode } : {}),
      ...(varianceReasonText.trim() ? { varianceReasonText: varianceReasonText.trim() } : {})
    }),
    onSuccess: async () => {
      message.success("工时申报已提交，等待店长确认");
      await queryClient.invalidateQueries({ queryKey: ["construction-work-cost-declaration", record?.id] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const startMutation = useMutation({
    mutationFn: () => constructionApi.startOrder(params.id, {
      commandId: getLifecycleCommandId(user!.id, storeId!, params.id, "START_CONSTRUCTION"),
      expectedVersion: fulfillment!.order.lifecycleVersion
    }),
    onSuccess: async () => {
      clearLifecycleCommandId(user!.id, storeId!, params.id, "START_CONSTRUCTION");
      message.success("已开工");
      await invalidateTask();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const completeMutation = useMutation({
    mutationFn: () => constructionApi.completeOrder(params.id, new Date().toISOString(), {
      commandId: getLifecycleCommandId(user!.id, storeId!, params.id, "COMPLETE_CONSTRUCTION"),
      expectedVersion: fulfillment!.order.lifecycleVersion
    }),
    onSuccess: async () => {
      clearLifecycleCommandId(user!.id, storeId!, params.id, "COMPLETE_CONSTRUCTION");
      message.success("已完工");
      await invalidateTask();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const pickupMutation = useMutation({
    mutationFn: (allocationIds: string[]) =>
      constructionApi.pickupMaterials(params.id, {
        allocationIds,
        note: "施工任务详情领取订单物料"
      }),
    onSuccess: async () => {
      message.success("物料领取已记录");
      await invalidateTask();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const uploadStagePhoto = async (stage: PhotoStage, file: File, title: string, clientOperationId: string) => {
    if (!record) {
      throw new Error("未找到该施工任务");
    }
    await constructionApi.uploadPhoto(record.id, { stage, file, clientOperationId });
    message.success(`${title}已上传`);
    await invalidateTask();
  };

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
            {getTaskSteps(fulfillment?.lifecycle.currentStage, pendingUploads, materialPickupState).map((step) => (
              <div key={step.label} className={step.state === "done" ? "is-done" : step.state === "active" ? "is-active" : undefined}>
                <i>{step.state === "done" ? <CheckOutlined /> : step.index}</i>
                <span>{step.label}</span>
              </div>
            ))}
          </section>

          <section className="worker-task-detail-actions" aria-label="施工执行操作">
            {fulfillment?.lifecycle.capabilities.startConstruction?.visible ? (
              <Button icon={<PlayCircleOutlined />} disabled={!fulfillment.lifecycle.capabilities.startConstruction.enabled} loading={startMutation.isPending} onClick={() => startMutation.mutate()}>
                开始施工
              </Button>
            ) : null}
            <Button
              icon={<InboxOutlined />}
              disabled={!pendingAllocationIds.length}
              loading={pickupMutation.isPending}
              onClick={() => pickupMutation.mutate(pendingAllocationIds)}
            >
              {pendingAllocationIds.length ? "领取物料" : hasLockedMaterials ? "物料已领取" : "无需领料"}
            </Button>
            {completeCapability?.visible ? (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                disabled={!completeCapability.enabled || Boolean(completeBlockReason)}
                loading={completeMutation.isPending}
                onClick={() => completeMutation.mutate()}
              >
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
                  <Descriptions.Item label="履约阶段">{fulfillment?.workflow.currentStage ?? "待计算"}</Descriptions.Item>
                  <Descriptions.Item label="预约时间">{formatSchedule(record)}</Descriptions.Item>
                  <Descriptions.Item label="施工地点">{formatLocation(record)}</Descriptions.Item>
                  <Descriptions.Item label="开工时间">{formatNullableDate(record.startedAt)}</Descriptions.Item>
                  <Descriptions.Item label="完工时间">{formatNullableDate(record.completedAt)}</Descriptions.Item>
                </Descriptions>
              </Card>

              {record.status === "COMPLETED" ? <Card className="worker-task-info-card" title="工时偏差申报" extra={<Tag color={declarationQuery.data?.status === "PENDING_CONFIRMATION" ? "warning" : "default"}>{declarationQuery.data?.status === "PENDING_CONFIRMATION" ? "待店长确认" : declarationQuery.data?.status === "CONFIRMED" ? "已确认" : declarationQuery.data?.status === "SETTLED" ? "已结算" : "加载中"}</Tag>}>
                <p>系统按标准工时结算。若实际工时不同，请在店长确认前申报并说明原因；确认后请联系店长通过调整单处理。</p>
                {declarationQuery.data ? <Space direction="vertical" style={{ width: "100%" }}><div>标准工时：<strong>{declarationQuery.data.standardMinutes} 分钟</strong></div><InputNumber min={0} value={declaredMinutes ?? declarationQuery.data.declaredMinutes ?? declarationQuery.data.standardMinutes} onChange={(value) => setDeclaredMinutes(Number(value ?? 0))} addonAfter="分钟" style={{ width: "100%" }} disabled={declarationQuery.data.status !== "PENDING_CONFIRMATION"} />{(declaredMinutes ?? declarationQuery.data.declaredMinutes ?? declarationQuery.data.standardMinutes) !== declarationQuery.data.standardMinutes ? <><Select value={varianceReasonCode ?? declarationQuery.data.varianceReasonCode ?? undefined} onChange={setVarianceReasonCode} options={varianceReasonOptions} placeholder="偏差原因（必选，来自系统字典）" disabled={declarationQuery.data.status !== "PENDING_CONFIRMATION"} /><Input value={varianceReasonText || declarationQuery.data.varianceReasonText || ""} onChange={(event) => setVarianceReasonText(event.target.value)} placeholder="补充说明（可选）" disabled={declarationQuery.data.status !== "PENDING_CONFIRMATION"} /></> : null}<Button type="primary" loading={declareWorkMutation.isPending} disabled={declarationQuery.data.status !== "PENDING_CONFIRMATION" || ((declaredMinutes ?? declarationQuery.data.declaredMinutes ?? declarationQuery.data.standardMinutes) !== declarationQuery.data.standardMinutes && !(varianceReasonCode ?? declarationQuery.data.varianceReasonCode))} onClick={() => declareWorkMutation.mutate()}>提交工时申报</Button></Space> : <span>正在生成成本确认记录…</span>}
              </Card> : null}

              <Card
                className="worker-task-material-card"
                title="物料领取"
                extra={<Tag color={materialPickupState.color}>{materialPickupState.label}</Tag>}
              >
                <div className="worker-task-material-summary">
                  <article>
                    <strong>{materialData?.summary.allocatedBatches ?? 0}</strong>
                    <span>锁定批次</span>
                  </article>
                  <article>
                    <strong>{materialData?.summary.pickedBatches ?? 0}</strong>
                    <span>已领取</span>
                  </article>
                  <article>
                    <strong>{pendingAllocationIds.length}</strong>
                    <span>待领取</span>
                  </article>
                </div>
                {completeBlockReason ? <p className="worker-task-complete-warning">{completeBlockReason}</p> : null}
                <Table<ConstructionMaterialItem>
                  rowKey="orderItemId"
                  size="small"
                  loading={materialsQuery.isLoading}
                  dataSource={materialData?.materials ?? []}
                  pagination={false}
                  locale={{ emptyText: <Empty description="当前订单暂无锁定物料" /> }}
                  columns={[
                    {
                      title: "产品",
                      render: (_, row) => (
                        <div className="worker-task-material-product">
                          <strong>{row.productLabel}</strong>
                          <span>
                            需求 {row.requiredQuantity} {row.unit} · 锁定 {row.allocatedQuantity} {row.unit}
                          </span>
                        </div>
                      )
                    },
                    {
                      title: "施工批次",
                      render: (_, row) =>
                        row.batches.length ? (
                          <Space direction="vertical" size={2}>
                            {row.batches.map((batch) => (
                              <span key={batch.allocationId}>
                                {batch.batchNo}（{batch.pickedUp ? "已领取" : "待领取"} {batch.lockedQuantity} {getProductUnitLabel(batch.unit)}）
                              </span>
                            ))}
                          </Space>
                        ) : (
                          "未锁定"
                        )
                    },
                    {
                      title: "待领取",
                      render: (_, row) => row.batches.filter((batch) => !batch.pickedUp).length
                    }
                  ]}
                />
                <Button
                  type="primary"
                  icon={<InboxOutlined />}
                  disabled={!pendingAllocationIds.length}
                  loading={pickupMutation.isPending}
                  onClick={() => pickupMutation.mutate(pendingAllocationIds)}
                >
                  {pendingAllocationIds.length ? "确认领取物料" : hasLockedMaterials ? "物料已全部领取" : "无需领取物料"}
                </Button>
              </Card>

              <Card id="task-photo-upload" className="worker-task-photo-card" title="照片凭证">
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
                          {stagePhotos.length ? (
                            <div className="worker-task-photo-preview-list">
                              {stagePhotos.map((photo, index) => (
                                <button key={photo.id} type="button" onClick={() => setPreviewPhoto(photo)}>
                                  {item.title} {index + 1}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <Upload
                          showUploadList={false}
                          customRequest={async ({ file, onError, onSuccess }) => {
                            try {
                              const clientOperationId = globalThis.crypto?.randomUUID?.() ?? `photo-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                              await uploadStagePhoto(item.stage, file as File, item.title, clientOperationId);
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

          </section>
        </>
      )}
      <Modal
        title={previewPhoto ? getWorkerPhotoStageLabel(previewPhoto.stage) : "施工照片"}
        open={Boolean(previewPhoto)}
        onCancel={() => setPreviewPhoto(null)}
        footer={null}
        width={760}
        centered
      >
        {previewPhoto ? (
          <div className="worker-task-photo-preview-modal">
            <Image src={previewPhoto.url} alt={getWorkerPhotoStageLabel(previewPhoto.stage)} />
            <a href={previewPhoto.url} target="_blank" rel="noreferrer">
              在新窗口打开原图
            </a>
          </div>
        ) : null}
      </Modal>
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

function getTaskSteps(stage: string | undefined, pendingUploads: number, materialPickupState: MaterialPickupState) {
  const inConstruction = stage === "IN_CONSTRUCTION" || stage === "REWORKING";
  const constructionCompleted = ["PENDING_QUALITY", "PENDING_BALANCE", "PENDING_DELIVERY", "COMPLETED"].includes(stage ?? "");
  return [
    { index: 1, label: "接单", state: "done" },
    {
      index: 2,
      label: "领取物料",
      state: materialPickupState.state === "done" || inConstruction || constructionCompleted ? "done" : "active"
    },
    {
      index: 3,
      label: "照片凭证",
      state: constructionCompleted || pendingUploads === 0 ? "done" : inConstruction ? "active" : "pending"
    },
    { index: 4, label: "已完成", state: stage === "COMPLETED" ? "done" : constructionCompleted ? "active" : "pending" }
  ];
}

type MaterialPickupState = {
  state: "loading" | "none" | "pending" | "done";
  label: string;
  color: string;
};

function getMaterialPickupState(
  materialData: ConstructionOrderMaterials | undefined,
  isLoading: boolean,
  pendingCount: number
): MaterialPickupState {
  if (isLoading) return { state: "loading", label: "加载中", color: "processing" };
  if (!materialData || materialData.summary.allocatedBatches === 0) {
    return { state: "none", label: "无需领料", color: "default" };
  }
  if (pendingCount > 0) {
    return { state: "pending", label: "待领料", color: "warning" };
  }
  return { state: "done", label: "已领料", color: "success" };
}

function getAuthoritativeCompleteBlockReason(
  capability: { visible: boolean; enabled: boolean; blockingReasonCodes: string[] } | undefined,
  pendingUploads: number,
  materialPickupState: MaterialPickupState
) {
  if (!capability) return "履约能力加载中";
  if (!capability.enabled && capability.blockingReasonCodes.length > 0) {
    const labels: Record<string, string> = {
      MATERIAL_PICKUP_REQUIRED: "请先领取已锁定的施工物料",
      ORDER_NOT_IN_CONSTRUCTION: "当前订单尚未进入施工中",
      HISTORICAL_VERIFICATION_REQUIRED: "历史履约事实待核验"
    };
    return capability.blockingReasonCodes.map((code) => labels[code] ?? code).join("、");
  }
  if (materialPickupState.state === "pending") return "请先领取已锁定的施工物料";
  if (materialPickupState.state === "loading") return "物料状态加载中，请稍后提交完工";
  if (pendingUploads > 0) return "请先补齐必传施工照片后再提交完工";
  return "";
}

function getStatusColor(status: string) {
  if (status === "COMPLETED") return "success";
  if (status === "IN_CONSTRUCTION") return "processing";
  return "default";
}

function getDictionaryOptions(dictionaries: DictionaryItem[], code: string) {
  return (dictionaries.find((item) => item.code === code && item.status === "ACTIVE")?.dictionaryItems ?? [])
    .filter((item) => item.status === "ACTIVE")
    .map((item) => ({ value: item.code, label: item.name }));
}
