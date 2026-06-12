/* global Page, wx */

const OFFLINE_QUEUE_KEY = "mallbay_offline_queue";
const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";

const TYPE_LABELS = {
  PHOTO_UPLOAD: "照片上传",
  TASK_STATUS: "施工状态",
  LEAVE_REQUEST: "请假申请"
};

const STATUS_LABELS = {
  PENDING: "待同步",
  SYNCING: "同步中",
  FAILED: "同步失败"
};
const MAX_OFFLINE_SYNC_RETRIES = 3;

Page({
  data: {
    summary: {
      total: 0,
      pending: 0,
      retrying: 0,
      failed: 0,
      description: "待同步 0 条，重试中 0 条，失败 0 条"
    },
    items: [],
    syncing: false
  },

  onShow() {
    const items = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
    this.setData({
      summary: buildSummary(items),
      items: items.map((item) => ({
        id: item.id,
        typeLabel: TYPE_LABELS[item.type] || item.type,
        statusLabel: STATUS_LABELS[item.status] || item.status,
        attempts: item.attempts || 0,
        lastError: item.lastError || ""
      }))
    });
  },

  syncQueue() {
    const apiBaseUrl = wx.getStorageSync(API_BASE_URL_KEY);
    const token = wx.getStorageSync(AUTH_TOKEN_KEY);
    if (!apiBaseUrl || !token) {
      wx.showToast({ title: "请先配置连接", icon: "none" });
      wx.navigateTo({ url: "/pages/settings/index" });
      return;
    }
    const queue = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
    if (queue.length === 0) {
      wx.showToast({ title: "没有待同步记录", icon: "none" });
      return;
    }
    const syncableQueue = queue.filter((item) => item.status !== "FAILED");
    this.setData({ syncing: true });
    syncPhotoOperations(apiBaseUrl, token, syncableQueue.filter((item) => item.type === "PHOTO_UPLOAD"))
      .then((photoResult) => syncBatchedOperations(apiBaseUrl, token, syncableQueue.filter((item) => item.type !== "PHOTO_UPLOAD"))
        .then((batchResult) => {
          const failedIds = new Set(photoResult.failed.concat(batchResult.failed));
          wx.setStorageSync(OFFLINE_QUEUE_KEY, buildRemainingQueue(queue, failedIds));
          this.onShow();
          wx.showToast({ title: `已同步 ${photoResult.synced + batchResult.synced} 条`, icon: "success" });
        }))
      .catch(() => {
        wx.showToast({ title: "同步失败", icon: "none" });
      })
      .finally(() => {
        this.setData({ syncing: false });
      });
  }
});

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

function buildSummary(items) {
  const pending = items.filter((item) => item.status === "PENDING").length;
  const retrying = items.filter((item) => item.status === "PENDING" && item.attempts > 0).length;
  const failed = items.filter((item) => item.status === "FAILED").length;
  return {
    total: items.length,
    pending,
    retrying,
    failed,
    description: `待同步 ${pending} 条，重试中 ${retrying} 条，失败 ${failed} 条`
  };
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
  if (items.length === 0) {
    return Promise.resolve({ synced: 0, failed: [] });
  }
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
