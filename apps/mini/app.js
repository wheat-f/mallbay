/* global App, wx */

const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";
const OFFLINE_QUEUE_KEY = "mallbay_offline_queue";
const AUTO_SYNC_LAST_AT_KEY = "mallbay_auto_sync_last_at";
const AUTO_SYNC_INTERVAL_MS = 60 * 1000;
const MAX_OFFLINE_SYNC_RETRIES = 3;

App({
  onLaunch() {
    runAutoSync();
  },

  onShow() {
    runAutoSync();
  }
});

function runAutoSync() {
  const apiBaseUrl = wx.getStorageSync(API_BASE_URL_KEY);
  const token = wx.getStorageSync(AUTH_TOKEN_KEY);
  const queue = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
  if (!apiBaseUrl || !token || queue.length === 0) return;

  const now = Date.now();
  const lastAt = Number(wx.getStorageSync(AUTO_SYNC_LAST_AT_KEY) || 0);
  if (lastAt > 0 && now - lastAt < AUTO_SYNC_INTERVAL_MS) return;

  const syncableQueue = queue.filter((item) => item.status !== "FAILED");
  wx.setStorageSync(AUTO_SYNC_LAST_AT_KEY, now);
  syncPhotoOperations(apiBaseUrl, token, syncableQueue.filter((item) => item.type === "PHOTO_UPLOAD"))
    .then((photoResult) => syncBatchedOperations(apiBaseUrl, token, syncableQueue.filter((item) => item.type !== "PHOTO_UPLOAD"))
      .then((batchResult) => {
        const failedIds = new Set(photoResult.failed.concat(batchResult.failed));
        wx.setStorageSync(OFFLINE_QUEUE_KEY, buildRemainingQueue(queue, failedIds));
      }))
    .catch(() => undefined);
}

function buildRemainingQueue(queue, failedIds) {
  return queue
    .filter((item) => item.status === "FAILED" || failedIds.has(item.id))
    .map((item) => {
      if (item.status === "FAILED") return item;
      const attempts = (item.attempts || 0) + 1;
      return {
        ...item,
        attempts,
        status: attempts >= MAX_OFFLINE_SYNC_RETRIES ? "FAILED" : "PENDING",
        lastError: "同步失败"
      };
    });
}

function syncPhotoOperations(apiBaseUrl, token, items) {
  const result = { synced: 0, failed: [] };
  return items.reduce((promise, item) => promise.then(() => new Promise((resolve) => {
    const payload = item.payload || {};
    const formData = { stage: payload.stage };
    if (payload.takenAt) {
      formData.takenAt = payload.takenAt;
    }
    wx.uploadFile({
      url: `${apiBaseUrl}/construction/records/${payload.recordId}/photos`,
      filePath: payload.localPath,
      name: "file",
      header: { Authorization: `Bearer ${token}` },
      formData,
      success: () => {
        result.synced += 1;
        resolve();
      },
      fail: () => {
        result.failed.push(item.id);
        resolve();
      }
    });
  })), Promise.resolve()).then(() => result);
}

function syncBatchedOperations(apiBaseUrl, token, items) {
  if (items.length === 0) return Promise.resolve({ synced: 0, failed: [] });
  return new Promise((resolve) => {
    wx.request({
      url: `${apiBaseUrl}/construction/offline-sync`,
      method: "POST",
      header: { Authorization: `Bearer ${token}` },
      data: {
        operations: items.map((item) => ({
          clientOperationId: item.id,
          type: item.type,
          payload: item.payload
        }))
      },
      success: (response) => {
        const syncedIds = new Set(((response.data && response.data.items) || [])
          .filter((item) => item.status === "SYNCED")
          .map((item) => item.clientOperationId));
        resolve({
          synced: syncedIds.size,
          failed: items.filter((item) => !syncedIds.has(item.id)).map((item) => item.id)
        });
      },
      fail: () => {
        resolve({ synced: 0, failed: items.map((item) => item.id) });
      }
    });
  });
}
