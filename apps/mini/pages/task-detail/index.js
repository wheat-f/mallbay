/* global Page, wx */

const TASK_CACHE_KEY = "mallbay_construction_tasks";
const OFFLINE_QUEUE_KEY = "mallbay_offline_queue";
const MAX_OFFLINE_QUEUE_ITEMS = 100;

const STATUS_LABELS = {
  DISPATCHED: "待开工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完工"
};

const PHOTO_STAGES = [
  { stage: "BEFORE", label: "施工前" },
  { stage: "DURING", label: "施工中" },
  { stage: "AFTER", label: "施工后" }
];

const STATUS_ACTIONS = {
  DISPATCHED: [{ status: "IN_CONSTRUCTION", label: "开工", disabled: false }],
  IN_CONSTRUCTION: [{ status: "COMPLETED", label: "完工", disabled: false }],
  COMPLETED: []
};

Page({
  data: {
    taskId: "",
    task: null,
    missingText: "未找到缓存任务"
  },

  onLoad(query) {
    this.setData({ taskId: query.id || "" });
  },

  onShow() {
    const tasks = wx.getStorageSync(TASK_CACHE_KEY) || [];
    const task = tasks.find((item) => item.id === this.data.taskId);
    this.setData({ task: task ? toTaskDetail(task) : null });
  },

  queuePhoto(event) {
    const stage = event.currentTarget.dataset.stage;
    wx.chooseMedia({
      count: 1,
      mediaType: ["image"],
      sourceType: ["album", "camera"],
      success: (result) => {
        const localPath = result.tempFiles && result.tempFiles[0] ? result.tempFiles[0].tempFilePath : "";
        if (!localPath) {
          wx.showToast({ title: "未获取到照片", icon: "none" });
          return;
        }
        const queue = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
        if (queue.length >= MAX_OFFLINE_QUEUE_ITEMS) {
          wx.showToast({ title: "本地缓存已达上限，请联网同步后再继续操作", icon: "none" });
          return;
        }
        const operation = {
          id: `offline_${Date.now()}`,
          type: "PHOTO_UPLOAD",
          payload: {
            recordId: this.data.taskId,
            stage,
            localPath,
            takenAt: new Date().toISOString()
          },
          attempts: 0,
          status: "PENDING",
          createdAt: new Date().toISOString()
        };
        wx.setStorageSync(OFFLINE_QUEUE_KEY, queue.concat(operation));
        wx.showToast({ title: "已加入离线队列", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "已取消拍照", icon: "none" });
      }
    });
  },

  queueStatusChange(event) {
    const status = event.currentTarget.dataset.status;
    if (!this.data.task || !this.data.task.orderId || !status) {
      wx.showToast({ title: "任务信息不完整", icon: "none" });
      return;
    }
    const queue = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
    if (queue.length >= MAX_OFFLINE_QUEUE_ITEMS) {
      wx.showToast({ title: "本地缓存已达上限，请联网同步后再继续操作", icon: "none" });
      return;
    }
    const payload = {
      orderId: this.data.task.orderId,
      status
    };
    if (status === "IN_CONSTRUCTION") {
      payload.startedAt = new Date().toISOString();
    }
    if (status === "COMPLETED") {
      payload.completedAt = new Date().toISOString();
    }
    const operation = {
      id: `offline_${Date.now()}`,
      type: "TASK_STATUS",
      payload,
      attempts: 0,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    wx.setStorageSync(OFFLINE_QUEUE_KEY, queue.concat(operation));
    wx.showToast({ title: "状态已加入离线队列", icon: "success" });
  },

  openOfflineQueue() {
    wx.navigateTo({ url: "/pages/offline/index" });
  }
});

function toTaskDetail(task) {
  return {
    id: task.id,
    orderId: task.orderId,
    title: task.orderNo,
    statusLabel: STATUS_LABELS[task.status] || task.status,
    customerVehicle: `${task.customerName} · ${task.vehicleLabel}`,
    construction: `${task.constructionType} · ${task.constructionLocation}`,
    schedule: [task.appointmentDate, task.appointmentTimeSlot].filter(Boolean).join(" "),
    address: task.outsideAddress || "到店施工",
    statusActions: STATUS_ACTIONS[task.status] || [],
    photoStages: PHOTO_STAGES.map((item) => ({
      ...item,
      uploaded: (task.photoStages || []).includes(item.stage)
    }))
  };
}
