"use client";

import { useEffect, useMemo, useState } from "react";
import { App, Button, Empty, Progress, Tag, Typography } from "antd";
import { DeleteOutlined, PauseOutlined, PlayCircleOutlined, SyncOutlined, WarningOutlined } from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import type { OfflineSyncOperation, OfflineSyncResult } from "@mallbay/shared";
import { constructionApi } from "../../../src/lib/api";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";

const queueStorageKey = "mallbay-construction-offline-queue";
const lastSyncStorageKey = "mallbay-construction-last-sync-at";
const maxCacheSizeMb = 200;

type QueuedOperation = OfflineSyncOperation & {
  status?: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  message?: string;
};

export default function ConstructionOfflinePage() {
  const { message } = App.useApp();
  const [operations, setOperations] = useState<QueuedOperation[]>([]);
  const [lastSyncAt, setLastSyncAt] = useState("暂无记录");
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    setOperations(readQueue());
    setLastSyncAt(window.localStorage.getItem(lastSyncStorageKey) ?? "暂无记录");
  }, []);

  const syncMutation = useMutation({
    mutationFn: () => constructionApi.offlineSync({ operations }),
    onMutate: () => {
      setOperations((current) => current.map((item) => ({ ...item, status: "SYNCING" })));
    },
    onSuccess: (result) => {
      const next = mergeSyncResult(operations, result);
      const nextSyncAt = new Date().toLocaleString("zh-CN", { hour12: false });
      setOperations(next);
      window.localStorage.setItem(queueStorageKey, JSON.stringify(next.filter((item) => item.status !== "SYNCED")));
      window.localStorage.setItem(lastSyncStorageKey, nextSyncAt);
      setLastSyncAt(nextSyncAt);
      message.success("离线队列已同步");
    },
    onError: (error: Error) => {
      setOperations((current) => current.map((item) => ({ ...item, status: "FAILED", message: error.message })));
      message.error(error.message);
    }
  });

  const pendingCount = useMemo(
    () => operations.filter((item) => item.status !== "SYNCED").length,
    [operations]
  );
  const syncedCount = useMemo(
    () => operations.filter((item) => item.status === "SYNCED").length,
    [operations]
  );
  const failedCount = useMemo(
    () => operations.filter((item) => item.status === "FAILED").length,
    [operations]
  );
  const cacheUsedMb = useMemo(() => getApproxCacheSizeMb(operations), [operations]);
  const syncProgress = operations.length > 0 ? Math.round((syncedCount / operations.length) * 100) : 0;

  const clearQueue = () => {
    setOperations([]);
    window.localStorage.removeItem(queueStorageKey);
    message.success("离线缓存已清理");
  };

  return (
    <ConstructionMobileShell title="离线同步" subtitle="拍照、开工和完工操作会在网络恢复后同步" active="profile" badgeCount={pendingCount}>
      <div className="construction-offline-alert">
        <WarningOutlined />
        <span>本地缓存上限 {maxCacheSizeMb}MB，请在网络恢复后及时同步并清理。</span>
      </div>

      <section className="construction-offline-status-card">
        <div>
          <Typography.Text>当前网络</Typography.Text>
          <strong>{paused ? "已暂停" : syncMutation.isPending ? "同步中" : "在线待命"}</strong>
          <span>上次同步 {lastSyncAt}</span>
        </div>
        <div className="construction-offline-cache">
          <strong>{cacheUsedMb.toFixed(1)} MB</strong>
          <span>/ {maxCacheSizeMb} MB 已用</span>
        </div>
        <Progress percent={Math.min(Math.round((cacheUsedMb / maxCacheSizeMb) * 100), 100)} showInfo={false} />
      </section>

      <div className="construction-offline-actions">
        <Button
          type="primary"
          icon={<SyncOutlined spin={syncMutation.isPending} />}
          disabled={operations.length === 0 || paused}
          loading={syncMutation.isPending}
          onClick={() => syncMutation.mutate()}
        >
          全部同步
        </Button>
        <Button
          icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />}
          onClick={() => setPaused((current) => !current)}
        >
          {paused ? "继续同步" : "暂停同步"}
        </Button>
        <Button danger icon={<DeleteOutlined />} disabled={operations.length === 0} onClick={clearQueue}>
          清理缓存
        </Button>
      </div>

      <section className="construction-mobile-panel construction-offline-group">
        <div className="construction-offline-toolbar">
          <div>
            <h2>待同步队列</h2>
            <p>{pendingCount} 条待处理，{failedCount} 条失败</p>
          </div>
          <Tag className="construction-schedule-date-tag">本地队列</Tag>
        </div>
        {operations.length === 0 ? (
          <Empty description="暂无离线操作" />
        ) : (
          <div className="construction-offline-list">
            {operations.map((item) => (
              <article key={item.clientOperationId} className="construction-offline-item">
                <div>
                  <Typography.Text strong>{getOperationTypeLabel(item.type)}</Typography.Text>
                  <p>{getOperationMessage(item)}</p>
                  <span>{item.clientOperationId}</span>
                </div>
                <Tag color={getQueueStatusColor(item.status)}>{getQueueStatusLabel(item.status)}</Tag>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="construction-offline-progress">
        <div>
          <span>共 {operations.length} 个操作</span>
          <span>已完成 {syncedCount} 个</span>
        </div>
        <Progress percent={syncProgress} showInfo />
      </section>
    </ConstructionMobileShell>
  );
}

function readQueue(): QueuedOperation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(queueStorageKey);
    if (!raw) return [];
    const items = JSON.parse(raw) as QueuedOperation[];
    return items.map((item) => ({ ...item, status: item.status ?? "PENDING" }));
  } catch {
    return [];
  }
}

function mergeSyncResult(operations: QueuedOperation[], result: OfflineSyncResult) {
  return operations.map((operation) => {
    const synced = result.items.find((item) => item.clientOperationId === operation.clientOperationId);
    if (!synced) return { ...operation, status: "FAILED" as const, message: "服务端未返回同步结果" };
    return {
      ...operation,
      status: synced.status,
      message: synced.message
    };
  });
}

function getOperationTypeLabel(type: string) {
  if (type === "PHOTO_UPLOAD") return "施工照片";
  if (type === "TASK_STATUS") return "任务状态";
  if (type === "LEAVE_REQUEST") return "请假申请";
  return type;
}

function getOperationMessage(operation: QueuedOperation) {
  if (operation.message) return operation.message;
  if (operation.type === "PHOTO_UPLOAD") return "照片文件等待上传";
  if (operation.type === "TASK_STATUS") return "施工状态等待同步";
  if (operation.type === "LEAVE_REQUEST") return "请假申请等待提交";
  return "离线操作等待同步";
}

function getQueueStatusLabel(status: QueuedOperation["status"]) {
  if (status === "SYNCED") return "已同步";
  if (status === "SYNCING") return "同步中";
  if (status === "FAILED") return "失败";
  return "待同步";
}

function getQueueStatusColor(status: QueuedOperation["status"]) {
  if (status === "SYNCED") return "success";
  if (status === "SYNCING") return "processing";
  if (status === "FAILED") return "error";
  return "default";
}

function getApproxCacheSizeMb(operations: QueuedOperation[]) {
  return JSON.stringify(operations).length / 1024 / 1024;
}
