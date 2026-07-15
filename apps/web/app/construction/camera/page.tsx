"use client";

import { App, Button, Card, Empty, Input, Progress, Select, Space, Tag } from "antd";
import {
  CameraOutlined,
  CheckCircleOutlined,
  CloudSyncOutlined,
  FileImageOutlined,
  LoadingOutlined,
  SaveOutlined,
  ShopOutlined,
  SyncOutlined,
  WarningOutlined
} from "@ant-design/icons";
import type { ConstructionPhotoStage } from "@mallbay/shared";
import { getWorkerPhotoStageLabel } from "@mallbay/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type TaskRow = {
  id: string;
  orderId: string;
  status: string;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
  } | null;
  photos?: Array<{ id?: string; stage?: ConstructionPhotoStage | string | null; url?: string | null; createdAt?: string | null }>;
};

const requiredStages: ConstructionPhotoStage[] = ["BEFORE", "DURING", "AFTER"];

export default function ConstructionCameraPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [selectedRecordId, setSelectedRecordId] = useState<string>();
  const [stage, setStage] = useState<ConstructionPhotoStage>("BEFORE");
  const [photoUrl, setPhotoUrl] = useState("");

  const tasksQuery = useQuery({
    queryKey: ["construction-tasks", storeId, "camera-entry"],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const rows = useMemo(() => (tasksQuery.data ?? []) as TaskRow[], [tasksQuery.data]);
  const effectiveSelectedRecordId = selectedRecordId ?? rows[0]?.id;
  const selectedTask = rows.find((row) => row.id === effectiveSelectedRecordId) ?? rows[0];
  const uploadedStages = new Set((selectedTask?.photos ?? []).map((photo) => photo.stage).filter(Boolean));
  const uploadedCount = requiredStages.filter((item) => uploadedStages.has(item)).length;
  const progressPercent = Math.round((uploadedCount / requiredStages.length) * 100);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedTask?.id) throw new Error("请选择施工任务");
      if (!photoUrl.trim()) throw new Error("请粘贴施工照片链接");
      return constructionApi.uploadPhoto(selectedTask.id, {
        stage,
        url: photoUrl.trim(),
        takenAt: new Date().toISOString()
      });
    },
    onSuccess: async () => {
      message.success("施工照片已保存");
      setPhotoUrl("");
      await queryClient.invalidateQueries({ queryKey: ["construction-tasks", storeId, "camera-entry"] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  return (
    <div className="management-page worker-camera-page">
      <StorePageHeader title="施工照片凭证" description="在 Web 后台补传、核验施工照片；现场拍摄和离线上传由小程序承接。">
        <Button icon={<CloudSyncOutlined />} onClick={() => router.push("/construction/offline")}>
          查看离线队列
        </Button>
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => router.push("/construction/tasks")}>
          返回我的任务
        </Button>
      </StorePageHeader>

      <section className="worker-camera-hero">
        <div>
          <Tag color="processing">选择施工任务</Tag>
          <h2>{selectedTask?.order?.orderNo ?? "请选择工单"}</h2>
          <p>按施工前、施工中、施工后三个阶段补传照片凭证，提交完工前需完成关键阶段照片。</p>
        </div>
        <div className="worker-camera-hero-progress">
          <strong>{progressPercent}%</strong>
          <Progress percent={progressPercent} showInfo={false} />
          <span>{uploadedCount} / {requiredStages.length} 必传阶段已完成</span>
        </div>
      </section>

      <section className="worker-camera-summary" aria-label="照片上传状态">
        {[
          { label: "必传阶段", value: requiredStages.length, tone: "primary" },
          { label: "已完成", value: uploadedCount, tone: "success" },
          { label: "待补传", value: requiredStages.length - uploadedCount, tone: "warning" },
          { label: "已上传照片", value: selectedTask?.photos?.length ?? 0, tone: "primary" }
        ].map((item) => (
          <article key={item.label} className={`worker-camera-stat is-${item.tone}`}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <div className="worker-camera-grid">
        <div className="construction-camera-workspace">
          <div className="construction-camera-offline-banner">
            <CloudSyncOutlined />
            <span>小程序离线照片同步成功后会出现在这里；Web 端用于补录和核验，不承担手机拍摄入口。</span>
          </div>

          <section className="construction-camera-upload-section">
            <div className="construction-camera-section-head">
              <h2>施工照片上传</h2>
              <em>粘贴已上传到云端的施工照片链接</em>
            </div>
            <article className="construction-camera-photo-card">
              <div className="construction-camera-photo-head">
                <div>
                  <strong>选择施工任务</strong>
                  <span className="construction-camera-status is-local">
                    <SaveOutlined />
                    Web 补传
                  </span>
                </div>
              </div>
              <Space orientation="vertical" size="middle" className="construction-camera-form">
                <Select
                  loading={tasksQuery.isLoading}
                  value={effectiveSelectedRecordId}
                  placeholder="选择施工任务"
                  onChange={setSelectedRecordId}
                  options={rows.map((row) => ({
                    value: row.id,
                    label: `${row.order?.orderNo ?? row.orderId} · ${formatSchedule(row)}`
                  }))}
                />
                <Select
                  value={stage}
                  onChange={setStage}
                  options={requiredStages.map((item) => ({
                    value: item,
                    label: getWorkerPhotoStageLabel(item)
                  }))}
                />
                <Input
                  value={photoUrl}
                  onChange={(event) => setPhotoUrl(event.target.value)}
                  placeholder="粘贴施工照片链接"
                />
                <Button
                  type="primary"
                  icon={uploadMutation.isPending ? <LoadingOutlined /> : <FileImageOutlined />}
                  loading={uploadMutation.isPending}
                  onClick={() => uploadMutation.mutate()}
                >
                  施工照片上传
                </Button>
              </Space>
            </article>
          </section>

          <section className="construction-camera-upload-section">
            <div className="construction-camera-section-head">
              <h2>阶段照片凭证</h2>
              <em>{selectedTask?.photos?.length ?? 0} 张照片</em>
            </div>
            <div className="construction-camera-photo-list">
              {requiredStages.map((item) => (
                <PhotoCard
                  key={item}
                  title={getWorkerPhotoStageLabel(item)}
                  uploaded={uploadedStages.has(item)}
                  photos={(selectedTask?.photos ?? []).filter((photo) => photo.stage === item)}
                />
              ))}
            </div>
          </section>
        </div>

        <aside className="worker-camera-side">
          <Card className="worker-camera-check-card" title="提交前检查">
            <ol>
              <li>施工前验车照片完整</li>
              <li>膜箱照片、膜桶照片与物料批次一致</li>
              <li>施工过程照片可追溯关键节点</li>
              <li>施工后照片满足质保归档要求</li>
            </ol>
          </Card>

          <Card className="worker-camera-sync-card" title="同步状态">
            <dl>
              <div>
                <dt>当前工单</dt>
                <dd>{selectedTask?.order?.orderNo ?? "未选择"}</dd>
              </div>
              <div>
                <dt>云端照片</dt>
                <dd>{selectedTask?.photos?.length ?? 0} 张</dd>
              </div>
              <div>
                <dt>离线入口</dt>
                <dd>请使用小程序拍摄后同步</dd>
              </div>
            </dl>
          </Card>

          <footer className="construction-camera-bottom-actions">
            <Button icon={<SyncOutlined />} onClick={() => router.push("/construction/offline")}>
              查看同步队列
            </Button>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => router.push(`/construction/tasks/${selectedTask?.orderId ?? ""}`)}>
              查看执行详情
            </Button>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function PhotoCard({
  title,
  uploaded,
  photos
}: {
  title: string;
  uploaded: boolean;
  photos: Array<{ id?: string; url?: string | null; createdAt?: string | null }>;
}) {
  return (
    <article className={`construction-camera-photo-card is-${uploaded ? "uploaded" : "empty"}`}>
      <div className="construction-camera-photo-head">
        <div>
          <strong>{title}</strong>
          <span className={`construction-camera-status is-${uploaded ? "uploaded" : "empty"}`}>
            {uploaded ? <CheckCircleOutlined /> : <WarningOutlined />}
            {uploaded ? "已上传" : "未上传"}
          </span>
        </div>
      </div>
      <div className="construction-camera-preview construction-camera-upload-placeholder">
        {uploaded ? <ShopOutlined /> : <CameraOutlined />}
        <span>{uploaded ? `${photos.length} 张照片已归档` : "等待补传或小程序同步"}</span>
      </div>
      <div className="construction-camera-gallery" aria-label={`${title}照片列表`}>
        {photos.length > 0 ? photos.map((photo) => (
          <a key={photo.id ?? photo.url} href={photo.url ?? "#"} target="_blank" rel="noreferrer">
            查看照片
          </a>
        )) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无照片" />}
      </div>
    </article>
  );
}

function formatSchedule(row: TaskRow) {
  return [row.order?.appointmentDate?.slice(0, 10), row.order?.appointmentTimeSlot].filter(Boolean).join(" ") || "预约待确认";
}
