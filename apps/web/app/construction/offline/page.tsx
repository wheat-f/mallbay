"use client";

import Image from "next/image";
import { useMemo, useState, useSyncExternalStore } from "react";
import { App, Button, Progress } from "antd";
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  ExclamationCircleFilled,
  PauseOutlined,
  PlayCircleOutlined,
  SyncOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import type { OfflineSyncOperation, OfflineSyncResult } from "@mallbay/shared";
import { useRouter } from "next/navigation";
import { constructionApi } from "../../../src/lib/api";

const queueStorageKey = "mallbay-construction-offline-queue";
const lastSyncStorageKey = "mallbay-construction-last-sync-at";
const maxCacheSizeMb = 200;

type QueuedOperation = OfflineSyncOperation & {
  status?: "PENDING" | "SYNCING" | "SYNCED" | "FAILED";
  message?: string;
};

type OfflineQueueRow = {
  clientOperationId: string;
  orderNo: string;
  title: string;
  capturedAt: string;
  sizeLabel: string;
  retryCount: number;
  status?: QueuedOperation["status"];
  imageSrc: string;
};

const offlinePreviewImages = [
  "https://lh3.googleusercontent.com/aida-public/AB6AXuC-6okr_UT3DNtnh231wQs9LyxCZ7lzuX7nCdvJ-GSOli-HU38V-lyFNEIvFRTKxkXOCH4EbkK6iAqeQs6nxZrKfrRPBjSxirjnCkvrd_IGkeVDZAch-DDag1R1J2P8MO0nzzgmb67WvrkXVXQcp5nDy1h8Ly68bkAOuy4c6Nfh3f6XIvpjftWSBhljHjWZ-GPHBW6JglCdzq8Dz3s0HI9lqSninbD95TKWcY2UXWzxOgUfOHgoT2L-wqyFJHOLw76Z7w_6JSvFw6y1",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuBGHk1LCI05eXAdIRiSvZOh-et0nEgYyiHKOEsFCAxALX_L2qNn-6bMs8Y3SOr4ZvO0KGHZHu_UyKGGow5otZLPno2hUwCuHF6KyKDIKI21mB9hQhaKRkIzRjL6cVG8RWMZ_73ZQ92Xd4tXgHTaIK8fk8GlPAXuPsCjVgRl1AJ7Old9qVmwbAtfMT_hmoRuOZ5o79_bTlYHjK-bO3SZtVRADh69mfgvY9-J1eS0b37qo-mm7i52gu6S1R2Frdf-2TOheizCHWqkDJGY",
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCrccep2z2BnczHSuVcd-a_E_AVFkUjs_FFhEQyjMtkpCat2kWwsx6Bu1RUnG0dEgJo39MN6GiJylBTzDFqWnCG5mSn-LmYPO4Wd3z0dllvTZpzENGeku15_jWX1gtpccgx72Vk5KNkqruJIieqVcepqxrsVW4aolSXZauS9-vtx5LXAVZGVW7WGFZCnR5Gtx_SqnHQUUnSUFwd5cPRAWfa-YPjrhMyYOj4_UjAw6tqb21wrVwg7j5yURZVhM3XzL23Agcu7U5jr_u-"
];

const offlinePreviewQueue: OfflineQueueRow[] = [
  {
    clientOperationId: "preview-1",
    orderNo: "ORD-20231024-01",
    title: "验车照片 - 车头正面",
    capturedAt: "2023-10-24 10:45:12",
    sizeLabel: "2.4 MB",
    retryCount: 0,
    status: "SYNCING",
    imageSrc: offlinePreviewImages[0]
  },
  {
    clientOperationId: "preview-2",
    orderNo: "ORD-20231024-01",
    title: "膜箱照片 - 防伪码",
    capturedAt: "2023-10-24 10:48:05",
    sizeLabel: "1.8 MB",
    retryCount: 0,
    status: "PENDING",
    imageSrc: offlinePreviewImages[1]
  },
  {
    clientOperationId: "preview-3",
    orderNo: "ORD-20231024-02",
    title: "完工照片 - 侧裙处",
    capturedAt: "2023-10-24 10:55:22",
    sizeLabel: "3.1 MB",
    retryCount: 1,
    status: "FAILED",
    imageSrc: offlinePreviewImages[2]
  }
];

export default function ConstructionOfflinePage() {
  const { message } = App.useApp();
  const router = useRouter();
  const offlineSnapshot = useSyncExternalStore(
    subscribeOfflineStorage,
    getOfflineStorageSnapshot,
    getOfflineStorageServerSnapshot
  );
  const storedQueue = useMemo(() => parseOfflineStorageSnapshot(offlineSnapshot), [offlineSnapshot]);
  const [operationOverride, setOperationOverride] = useState<QueuedOperation[] | null>(null);
  const [paused, setPaused] = useState(false);
  const operations = operationOverride ?? storedQueue.operations;
  const lastSyncAt = storedQueue.lastSyncAt;

  const queueRows = useMemo(
    () => (operations.length > 0 ? operations.map(mapOperationToQueueRow) : offlinePreviewQueue),
    [operations]
  );
  const groupedRows = useMemo(() => groupOfflineQueue(queueRows), [queueRows]);
  const pendingCount = useMemo(
    () => queueRows.filter((item) => item.status !== "SYNCED").length,
    [queueRows]
  );
  const syncedCount = useMemo(
    () => queueRows.filter((item) => item.status === "SYNCED").length,
    [queueRows]
  );
  const cacheUsedMb = operations.length > 0 ? getApproxCacheSizeMb(operations) : 45.2;
  const syncProgress = queueRows.length > 0 ? Math.round((syncedCount / queueRows.length) * 100) : 0;

  const syncMutation = useMutation({
    mutationFn: () => constructionApi.offlineSync({ operations }),
    onMutate: () => {
      setOperationOverride((current) => (current ?? operations).map((item) => ({ ...item, status: "SYNCING" })));
    },
    onSuccess: (result) => {
      const next = mergeSyncResult(operations, result);
      const nextSyncAt = new Date().toLocaleString("zh-CN", { hour12: false });
      setOperationOverride(next);
      window.localStorage.setItem(queueStorageKey, JSON.stringify(next.filter((item) => item.status !== "SYNCED")));
      window.localStorage.setItem(lastSyncStorageKey, nextSyncAt);
      notifyOfflineStorageChanged();
      message.success("离线队列已同步");
    },
    onError: (error: Error) => {
      setOperationOverride((current) => (current ?? operations).map((item) => ({ ...item, status: "FAILED", message: error.message })));
      message.error(error.message);
    }
  });

  const handleSync = () => {
    if (operations.length === 0) {
      message.info("暂无真实离线队列，当前显示为原型预览数据");
      return;
    }
    if (paused) {
      message.warning("同步已暂停");
      return;
    }
    syncMutation.mutate();
  };

  const clearQueue = () => {
    setOperationOverride([]);
    window.localStorage.removeItem(queueStorageKey);
    notifyOfflineStorageChanged();
    message.success("离线缓存已清理");
  };

  return (
    <main className="construction-offline-mobile-shell">
      <header className="construction-offline-appbar">
        <button type="button" aria-label="返回" onClick={() => router.back()}>
          <ArrowLeftOutlined />
        </button>
        <h1>离线上传队列</h1>
        <button type="button" onClick={() => window.location.reload()}>
          刷新
        </button>
      </header>

      <section className="construction-offline-alert">
        <WarningOutlined />
        <span>缓存接近上限（{maxCacheSizeMb}MB），请尽快连接网络同步数据。</span>
      </section>

      <section className="construction-offline-status-card">
        <div>
          <span>当前网络：<strong>{paused ? "已暂停" : syncMutation.isPending ? "同步中" : "弱网"}</strong></span>
          <em>上次同步时间 {lastSyncAt}</em>
        </div>
        <div className="construction-offline-cache">
          <strong>{cacheUsedMb.toFixed(1)} <small>MB</small></strong>
          <span>/ {maxCacheSizeMb} MB 已用</span>
        </div>
        <Progress percent={Math.min(Math.round((cacheUsedMb / maxCacheSizeMb) * 100), 100)} showInfo={false} />
      </section>

      <div className="construction-offline-actions">
        <Button type="primary" icon={<SyncOutlined spin={syncMutation.isPending} />} loading={syncMutation.isPending} onClick={handleSync}>
          全部同步
        </Button>
        <Button icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={() => setPaused((current) => !current)}>
          {paused ? "继续同步" : "暂停同步"}
        </Button>
        <Button danger icon={<DeleteOutlined />} aria-label="清理缓存" onClick={clearQueue} />
      </div>

      <section className="construction-mobile-panel construction-offline-group">
        <div className="construction-offline-list">
          {groupedRows.map((group) => (
            <section key={group.orderNo} className="construction-offline-order-group">
              <h3>订单 #{group.orderNo}</h3>
              <div>
                {group.items.map((item) => (
                  <article key={item.clientOperationId} className="construction-offline-queue-item">
                    <div className="construction-offline-thumb">
                      <Image src={item.imageSrc} alt={item.title} width={80} height={80} sizes="80px" unoptimized />
                      {item.status === "SYNCING" ? (
                        <span className="construction-offline-thumb-overlay">
                          <SyncOutlined spin />
                        </span>
                      ) : null}
                      {item.status === "FAILED" ? (
                        <span className="construction-offline-thumb-error">
                          <ExclamationCircleFilled />
                        </span>
                      ) : null}
                    </div>
                    <div className="construction-offline-queue-main">
                      <div className="construction-offline-queue-title">
                        <strong>{item.title}</strong>
                        <span className={`construction-offline-state-badge is-${item.status ?? "PENDING"}`}>
                          {getQueueStatusLabel(item.status)}
                        </span>
                      </div>
                      <p>{item.capturedAt}</p>
                      <div className="construction-offline-queue-meta">
                        <span>{item.sizeLabel}</span>
                        <span>重试 {item.retryCount} 次</span>
                        {item.status === "FAILED" ? <button type="button" onClick={handleSync}>重试同步</button> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <footer className="construction-offline-footer construction-offline-progress">
        <div>
          <span>共 {pendingCount} 个文件待上传</span>
          <span>预计还需：-- 分钟</span>
        </div>
        <Progress percent={syncProgress || 33} showInfo />
      </footer>
    </main>
  );
}

function subscribeOfflineStorage(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => onStoreChange();
  window.addEventListener("storage", handler);
  window.addEventListener("mallbay-offline-storage", handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("mallbay-offline-storage", handler);
  };
}

function getOfflineStorageServerSnapshot() {
  return JSON.stringify({ queue: null, lastSyncAt: "2023-10-24 10:30" });
}

function getOfflineStorageSnapshot() {
  if (typeof window === "undefined") return getOfflineStorageServerSnapshot();
  return JSON.stringify({
    queue: window.localStorage.getItem(queueStorageKey),
    lastSyncAt: window.localStorage.getItem(lastSyncStorageKey) ?? "2023-10-24 10:30"
  });
}

function notifyOfflineStorageChanged() {
  window.dispatchEvent(new Event("mallbay-offline-storage"));
}

function parseOfflineStorageSnapshot(snapshot: string): { operations: QueuedOperation[]; lastSyncAt: string } {
  try {
    const parsed = JSON.parse(snapshot) as { queue?: string | null; lastSyncAt?: string | null };
    const rawQueue = parsed.queue;
    if (!rawQueue) {
      return { operations: [], lastSyncAt: parsed.lastSyncAt ?? "2023-10-24 10:30" };
    }
    const items = JSON.parse(rawQueue) as QueuedOperation[];
    return {
      operations: items.map((item) => ({ ...item, status: item.status ?? "PENDING" })),
      lastSyncAt: parsed.lastSyncAt ?? "2023-10-24 10:30"
    };
  } catch {
    return { operations: [], lastSyncAt: "2023-10-24 10:30" };
  }
}

function mapOperationToQueueRow(operation: QueuedOperation, index: number): OfflineQueueRow {
  const payload = operation.payload;
  return {
    clientOperationId: operation.clientOperationId,
    orderNo: getPayloadString(payload, "orderNo") ?? getPayloadString(payload, "orderId") ?? "待关联订单",
    title: getPayloadString(payload, "title") ?? getPayloadString(payload, "stage") ?? getOperationTypeLabel(operation.type),
    capturedAt: getPayloadString(payload, "capturedAt") ?? getPayloadString(payload, "createdAt") ?? "本地暂存",
    sizeLabel: getPayloadString(payload, "sizeLabel") ?? "待计算",
    retryCount: getPayloadNumber(payload, "retryCount") ?? 0,
    status: operation.status,
    imageSrc: offlinePreviewImages[index % offlinePreviewImages.length]
  };
}

function groupOfflineQueue(rows: OfflineQueueRow[]) {
  const groups = new Map<string, OfflineQueueRow[]>();
  rows.forEach((row) => {
    const current = groups.get(row.orderNo) ?? [];
    current.push(row);
    groups.set(row.orderNo, current);
  });
  return Array.from(groups.entries()).map(([orderNo, items]) => ({ orderNo, items }));
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

function getQueueStatusLabel(status: QueuedOperation["status"]) {
  if (status === "SYNCED") return "已同步";
  if (status === "SYNCING") return "同步中";
  if (status === "FAILED") return "同步失败";
  return "等待同步";
}

function getPayloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getPayloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function getApproxCacheSizeMb(operations: QueuedOperation[]) {
  return JSON.stringify(operations).length / 1024 / 1024;
}
