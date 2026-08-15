"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Card, Progress, Space, Table, Tag, Typography } from "antd";
import {
  DeleteOutlined,
  PauseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SyncOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useMutation } from "@tanstack/react-query";
import type { OfflineSyncOperation, OfflineSyncResult, OfflineSyncStatus } from "@mallbay/shared";
import { constructionApi, orderApi } from "../../../src/lib/api";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

const queueStorageKey = "mallbay-construction-offline-queue";
const lastSyncStorageKey = "mallbay-construction-last-sync-at";
const lastSyncSummaryStorageKey = "mallbay-construction-last-sync-summary";
const maxCacheSizeMb = 200;

type QueuedOperation = OfflineSyncOperation & {
  status?: "PENDING" | "SYNCING" | OfflineSyncStatus;
  code?: string;
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
  code?: string;
  message?: string;
  imageSrc?: string;
  latestTaskHref?: string;
};

type OfflineSyncSummary = {
  total: number;
  applied: number;
  replayed: number;
  needsAttention: number;
  retryable: number;
  items: Array<Pick<OfflineQueueRow, "clientOperationId" | "orderNo" | "title" | "status" | "code" | "message" | "latestTaskHref">>;
};

const offlinePreviewImages = [
  "/prototype-assets/construction-offline-1.png",
  "/prototype-assets/construction-offline-2.png",
  "/prototype-assets/construction-offline-3.png"
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
    status: "RETRYABLE_FAILURE",
    imageSrc: offlinePreviewImages[2]
  }
];

export default function ConstructionOfflinePage() {
  const router = useRouter();
  const { message, modal } = App.useApp();
  const offlineSnapshot = useSyncExternalStore(
    subscribeOfflineStorage,
    getOfflineStorageSnapshot,
    getOfflineStorageServerSnapshot
  );
  const storedQueue = useMemo(() => parseOfflineStorageSnapshot(offlineSnapshot), [offlineSnapshot]);
  const [operationOverride, setOperationOverride] = useState<QueuedOperation[] | null>(null);
  const [summaryOverride, setSummaryOverride] = useState<OfflineSyncSummary | null | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const operations = operationOverride ?? storedQueue.operations;
  const lastSyncAt = storedQueue.lastSyncAt;
  const syncSummary = summaryOverride === undefined ? storedQueue.summary : summaryOverride;

  const queueRows = useMemo(
    () => (operations.length > 0 ? operations.map(mapOperationToQueueRow) : offlinePreviewQueue),
    [operations]
  );
  const groupedRows = useMemo(() => groupOfflineQueue(queueRows), [queueRows]);
  const pendingCount = useMemo(
    () => queueRows.filter((item) => item.status !== "APPLIED" && item.status !== "REPLAYED").length,
    [queueRows]
  );
  const syncedCount = useMemo(
    () => queueRows.filter((item) => item.status === "APPLIED" || item.status === "REPLAYED").length,
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
      const summary = buildOfflineSyncSummary(next);
      const nextSyncAt = new Date().toLocaleString("zh-CN", { hour12: false });
      setOperationOverride(next);
      setSummaryOverride(summary);
      window.localStorage.setItem(queueStorageKey, JSON.stringify(next.filter((item) => item.status !== "APPLIED" && item.status !== "REPLAYED")));
      window.localStorage.setItem(lastSyncStorageKey, nextSyncAt);
      window.localStorage.setItem(lastSyncSummaryStorageKey, JSON.stringify(summary));
      notifyOfflineStorageChanged();
      message.success("离线队列已同步");
    },
    onError: (error: Error) => {
      const failed = (operationOverride ?? operations).map((item) => ({ ...item, status: "RETRYABLE_FAILURE" as const, message: error.message }));
      const summary = buildOfflineSyncSummary(failed);
      setOperationOverride(failed);
      setSummaryOverride(summary);
      window.localStorage.setItem(lastSyncSummaryStorageKey, JSON.stringify(summary));
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

  const viewLatestTask = (href: string) => {
    void orderApi.recordLifecycleClientEvent({ event: "VIEW_LATEST_VERSION", surface: "CONSTRUCTION_OFFLINE", commandType: "OFFLINE_SYNC" });
    router.push(href);
  };

  const clearQueue = () => {
    modal.confirm({
      title: "清理离线缓存？",
      content: `当前有 ${pendingCount} 条待处理记录。这里只删除本地记录，不撤销已经提交到服务端的事实。`,
      okText: "只删除本地记录",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        setOperationOverride([]);
        setSummaryOverride(null);
        window.localStorage.removeItem(queueStorageKey);
        window.localStorage.removeItem(lastSyncSummaryStorageKey);
        notifyOfflineStorageChanged();
        message.success("离线本地记录已清理，服务端事实不受影响");
      }
    });
  };

  const clearSyncSummary = () => {
    modal.confirm({
      title: "清除本次同步摘要？",
      content: "这里只清除本地摘要，不会撤销已经提交到服务端的事实。",
      okText: "清除摘要",
      cancelText: "保留",
      onOk: () => {
        setSummaryOverride(null);
        window.localStorage.removeItem(lastSyncSummaryStorageKey);
        notifyOfflineStorageChanged();
      }
    });
  };

  return (
    <div className="management-page worker-offline-page">
      <StorePageHeader title="离线上传队列" description="查看施工照片、任务状态和请假申请的本地待同步记录。">
        <Button icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={() => setPaused((current) => !current)}>
          {paused ? "继续同步" : "暂停同步"}
        </Button>
        <Button type="primary" icon={<SyncOutlined spin={syncMutation.isPending} />} loading={syncMutation.isPending} onClick={handleSync}>
          全部同步
        </Button>
      </StorePageHeader>

      <Alert
        className="construction-offline-alert"
        type="warning"
        showIcon
        icon={<WarningOutlined />}
        title={`缓存接近上限（${maxCacheSizeMb}MB），请尽快连接网络同步数据。`}
      />

      <section className="worker-offline-grid">
        <Card className="construction-offline-status-card">
          <div>
            <span>当前网络：<strong>{paused ? "已暂停" : syncMutation.isPending ? "同步中" : "弱网"}</strong></span>
            <em>上次同步时间 {lastSyncAt}</em>
          </div>
          <div className="construction-offline-cache">
            <strong>{cacheUsedMb.toFixed(1)} <small>MB</small></strong>
            <span>/ {maxCacheSizeMb} MB 已用</span>
          </div>
          <Progress percent={Math.min(Math.round((cacheUsedMb / maxCacheSizeMb) * 100), 100)} showInfo={false} />
        </Card>

        <Card className="construction-offline-actions" title="队列操作">
          <Space wrap>
            <Button type="primary" icon={<SyncOutlined spin={syncMutation.isPending} />} loading={syncMutation.isPending} onClick={handleSync}>
              全部同步
            </Button>
            <Button icon={paused ? <PlayCircleOutlined /> : <PauseOutlined />} onClick={() => setPaused((current) => !current)}>
              {paused ? "继续同步" : "暂停同步"}
            </Button>
            <Button danger icon={<DeleteOutlined />} aria-label="清理缓存" onClick={clearQueue}>
              清理缓存
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
              刷新
            </Button>
          </Space>
        </Card>
      </section>

      <Card className="construction-offline-table-card" title="待同步明细">
        <Table<OfflineQueueRow>
          rowKey="clientOperationId"
          dataSource={queueRows}
          pagination={false}
          columns={[
            { title: "订单", dataIndex: "orderNo" },
            { title: "事项", dataIndex: "title" },
            { title: "暂存时间", dataIndex: "capturedAt" },
            { title: "大小", dataIndex: "sizeLabel" },
            { title: "重试", dataIndex: "retryCount", render: (value: number) => `${value} 次` },
            {
              title: "状态",
              dataIndex: "status",
              render: (status: QueuedOperation["status"]) => (
                <Tag className={`construction-offline-state-badge is-${status ?? "PENDING"}`}>
                  {getQueueStatusLabel(status)}
                </Tag>
              )
            },
            {
              title: "处理说明",
              dataIndex: "message",
              render: (_: string | undefined, row: OfflineQueueRow) => row.message || row.code ? (
                <Typography.Text type="secondary">
                  {row.code ? `${row.code}${row.message ? "：" : ""}` : ""}{row.message ?? ""}
                </Typography.Text>
              ) : "-"
            },
            {
              title: "操作",
              render: (_, row) => row.status === "CONFLICT" ? (
                <Button size="small" onClick={() => viewLatestTask(row.latestTaskHref ?? "/construction/tasks")}>查看最新任务</Button>
              ) : row.status === "RETRYABLE_FAILURE" ? <Button size="small" onClick={handleSync}>重试同步</Button> : null
            }
          ]}
        />

        <div className="construction-offline-mobile-cards">
          {queueRows.map((item) => (
            <article key={item.clientOperationId} className="construction-offline-queue-item">
              <div className="construction-offline-queue-main">
                <div className="construction-offline-queue-title">
                  <strong>{item.title}</strong>
                  <span className={`construction-offline-state-badge is-${item.status ?? "PENDING"}`}>
                    {getQueueStatusLabel(item.status)}
                  </span>
                </div>
                <p>{item.orderNo} · {item.capturedAt}</p>
                {item.message || item.code ? <Typography.Text type="secondary">{item.code ? `${item.code}${item.message ? "：" : ""}` : ""}{item.message ?? ""}</Typography.Text> : null}
                <div className="construction-offline-queue-meta">
                  <span>{item.sizeLabel}</span>
                  <span>重试 {item.retryCount} 次</span>
                  {item.status === "CONFLICT" ? <button type="button" onClick={() => viewLatestTask(item.latestTaskHref ?? "/construction/tasks")}>查看最新任务</button> : null}
                  {item.status === "RETRYABLE_FAILURE" ? <button type="button" onClick={handleSync}>重试同步</button> : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <section className="construction-mobile-panel construction-offline-group">
        <div className="construction-offline-list">
          {groupedRows.map((group) => (
            <section key={group.orderNo} className="construction-offline-order-group">
              <h3>订单 #{group.orderNo}</h3>
              <div>
                {group.items.map((item) => (
                  <article key={item.clientOperationId} className="construction-offline-queue-item">
                    <div className="construction-offline-queue-main">
                      <div className="construction-offline-queue-title">
                        <strong>{item.title}</strong>
                        <span className={`construction-offline-state-badge is-${item.status ?? "PENDING"}`}>
                          {getQueueStatusLabel(item.status)}
                        </span>
                      </div>
                      <p>{item.capturedAt}</p>
                      {item.message || item.code ? <Typography.Text type="secondary">{item.code ? `${item.code}${item.message ? "：" : ""}` : ""}{item.message ?? ""}</Typography.Text> : null}
                      <div className="construction-offline-queue-meta">
                        <span>{item.sizeLabel}</span>
                        <span>重试 {item.retryCount} 次</span>
                  {item.status === "CONFLICT" ? <button type="button" onClick={() => viewLatestTask(item.latestTaskHref ?? "/construction/tasks")}>查看最新任务</button> : null}
                        {item.status === "RETRYABLE_FAILURE" ? <button type="button" onClick={handleSync}>重试同步</button> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>

      <Card className="construction-offline-progress">
        <div>
          <span>共 {pendingCount} 个文件待上传</span>
          <span>预计还需：-- 分钟</span>
        </div>
        <Progress percent={syncProgress || 33} showInfo />
      </Card>

      {syncSummary ? (
        <Card className="construction-offline-summary" title="本次同步结果">
          <div className="construction-offline-summary-stats">
            <Tag color="success">成功 {syncSummary.applied}</Tag>
            <Tag color="success">已重放 {syncSummary.replayed}</Tag>
            <Tag color="warning">需处理 {syncSummary.needsAttention}</Tag>
            <Tag color="error">可重试 {syncSummary.retryable}</Tag>
          </div>
          <div className="construction-offline-summary-items">
            {syncSummary.items.map((item) => (
              <div key={item.clientOperationId} className="construction-offline-summary-item">
                <span>{item.orderNo} · {item.title}</span>
                <span className={`construction-offline-state-badge is-${item.status ?? "PENDING"}`}>{getQueueStatusLabel(item.status)}</span>
                <small>{item.code ? `${item.code}${item.message ? "：" : ""}` : ""}{item.message ?? ""}</small>
              </div>
            ))}
          </div>
          <Button size="small" onClick={clearSyncSummary}>清除本次摘要</Button>
        </Card>
      ) : null}
    </div>
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
  return JSON.stringify({ queue: null, lastSyncAt: "2023-10-24 10:30", summary: null });
}

function getOfflineStorageSnapshot() {
  if (typeof window === "undefined") return getOfflineStorageServerSnapshot();
  return JSON.stringify({
    queue: window.localStorage.getItem(queueStorageKey),
    lastSyncAt: window.localStorage.getItem(lastSyncStorageKey) ?? "2023-10-24 10:30",
    summary: window.localStorage.getItem(lastSyncSummaryStorageKey)
  });
}

function notifyOfflineStorageChanged() {
  window.dispatchEvent(new Event("mallbay-offline-storage"));
}

function parseOfflineStorageSnapshot(snapshot: string): { operations: QueuedOperation[]; lastSyncAt: string; summary: OfflineSyncSummary | null } {
  try {
    const parsed = JSON.parse(snapshot) as { queue?: string | null; lastSyncAt?: string | null };
    const rawQueue = parsed.queue;
    if (!rawQueue) {
      return { operations: [], lastSyncAt: parsed.lastSyncAt ?? "2023-10-24 10:30", summary: parseOfflineSyncSummary((parsed as { summary?: string | null }).summary) };
    }
    const items = JSON.parse(rawQueue) as QueuedOperation[];
    return {
      operations: items.map((item) => ({ ...item, status: normalizeOfflineStatus(item.status) })),
      lastSyncAt: parsed.lastSyncAt ?? "2023-10-24 10:30",
      summary: parseOfflineSyncSummary((parsed as { summary?: string | null }).summary)
    };
  } catch {
    return { operations: [], lastSyncAt: "2023-10-24 10:30", summary: null };
  }
}

function normalizeOfflineStatus(status: unknown): QueuedOperation["status"] {
  if (status === "SYNCED") return "APPLIED";
  if (status === "FAILED") return "RETRYABLE_FAILURE";
  if (status === "APPLIED" || status === "REPLAYED" || status === "CONFLICT" || status === "RETRYABLE_FAILURE" || status === "REJECTED" || status === "SYNCING") {
    return status;
  }
  return "PENDING";
}

function mapOperationToQueueRow(operation: QueuedOperation): OfflineQueueRow {
  const payload = operation.payload;
  return {
    clientOperationId: operation.clientOperationId,
    orderNo: getPayloadString(payload, "orderNo") ?? "待关联订单",
    title: getPayloadString(payload, "title") ?? getPayloadString(payload, "stage") ?? getOperationTypeLabel(operation.type),
    capturedAt: getPayloadString(payload, "capturedAt") ?? getPayloadString(payload, "createdAt") ?? "本地暂存",
    sizeLabel: getPayloadString(payload, "sizeLabel") ?? "待计算",
    retryCount: getPayloadNumber(payload, "retryCount") ?? 0,
    status: operation.status,
    code: operation.code,
    message: operation.message,
    latestTaskHref: getLatestTaskHref(payload)
  };
}

function getLatestTaskHref(payload: Record<string, unknown>) {
  const orderId = getPayloadString(payload, "orderId");
  if (orderId) return `/construction/tasks/${encodeURIComponent(orderId)}`;
  const recordId = getPayloadString(payload, "recordId");
  if (recordId) return `/construction/orders/${encodeURIComponent(recordId)}`;
  return undefined;
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
    if (!synced) return { ...operation, status: "RETRYABLE_FAILURE" as const, message: "服务端未返回同步结果" };
    return {
      ...operation,
      status: synced.status,
      code: synced.code,
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
  if (status === "APPLIED") return "已应用";
  if (status === "REPLAYED") return "已重放";
  if (status === "CONFLICT") return "版本冲突，待处理";
  if (status === "RETRYABLE_FAILURE") return "可重试失败";
  if (status === "REJECTED") return "已拒绝";
  if (status === "SYNCING") return "同步中";
  return "等待同步";
}

function buildOfflineSyncSummary(operations: QueuedOperation[]): OfflineSyncSummary {
  const items = operations.map(mapOperationToQueueRow);
  return {
    total: items.length,
    applied: items.filter((item) => item.status === "APPLIED").length,
    replayed: items.filter((item) => item.status === "REPLAYED").length,
    needsAttention: items.filter((item) => item.status === "CONFLICT" || item.status === "REJECTED").length,
    retryable: items.filter((item) => item.status === "RETRYABLE_FAILURE").length,
    items
  };
}

function parseOfflineSyncSummary(value: unknown): OfflineSyncSummary | null {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as Partial<OfflineSyncSummary>;
    if (!Array.isArray(parsed.items)) return null;
    return {
      total: Number(parsed.total) || parsed.items.length,
      applied: Number(parsed.applied) || 0,
      replayed: Number(parsed.replayed) || 0,
      needsAttention: Number(parsed.needsAttention) || 0,
      retryable: Number(parsed.retryable) || 0,
      items: parsed.items.filter((item): item is OfflineSyncSummary["items"][number] => Boolean(item && typeof item === "object" && typeof item.clientOperationId === "string"))
    };
  } catch {
    return null;
  }
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
