/* global Page, wx */

const TASK_CACHE_KEY = "mallbay_construction_tasks";
const OFFLINE_QUEUE_KEY = "mallbay_offline_queue";
const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";
const STORE_ID_KEY = "mallbay_store_id";

const STATUS_LABELS = {
  DISPATCHED: "待开工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完工"
};

Page({
  data: {
    tasks: [],
    emptyText: "暂无缓存任务，请联网同步后查看",
    offlineCount: 0,
    syncing: false
  },

  onShow() {
    const cachedTasks = wx.getStorageSync(TASK_CACHE_KEY) || [];
    const offlineItems = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
    this.setData({
      tasks: cachedTasks.map(toTaskListItem),
      offlineCount: offlineItems.length
    });
  },

  openTask(event) {
    wx.navigateTo({
      url: `/pages/task-detail/index?id=${event.currentTarget.dataset.id}`
    });
  },

  openOfflineQueue() {
    wx.navigateTo({ url: "/pages/offline/index" });
  },

  openLeaveRequest() {
    wx.navigateTo({ url: "/pages/leave/index" });
  },

  openSchedule() {
    wx.navigateTo({ url: "/pages/schedule/index" });
  },

  openSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  syncTasks() {
    const apiBaseUrl = wx.getStorageSync(API_BASE_URL_KEY);
    const token = wx.getStorageSync(AUTH_TOKEN_KEY);
    const storeId = wx.getStorageSync(STORE_ID_KEY);
    if (!apiBaseUrl || !token || !storeId) {
      wx.showToast({ title: "请先配置连接", icon: "none" });
      wx.navigateTo({ url: "/pages/settings/index" });
      return;
    }
    this.setData({ syncing: true });
    wx.request({
      url: `${apiBaseUrl}/construction/assignments?storeId=${encodeURIComponent(storeId)}`,
      method: "GET",
      header: { Authorization: `Bearer ${token}` },
      success: (response) => {
        const records = normalizeAssignmentsResponse(response.data);
        const tasks = records.map(toCachedTask);
        wx.setStorageSync(TASK_CACHE_KEY, tasks);
        this.setData({ tasks: tasks.map(toTaskListItem) });
        wx.showToast({ title: "任务已同步", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "同步失败", icon: "none" });
      },
      complete: () => {
        this.setData({ syncing: false });
      }
    });
  }
});

function toCachedTask(record) {
  const order = record.order || {};
  return {
    id: record.id,
    orderId: record.orderId,
    orderNo: order.orderNo || record.orderId,
    customerName: "客户待同步",
    vehicleLabel: "车辆待同步",
    constructionType: getConstructionTypeLabel(order.constructionType),
    constructionLocation: getConstructionLocationLabel(order.constructionLocation),
    appointmentDate: order.appointmentDate ? order.appointmentDate.slice(0, 10) : "",
    appointmentTimeSlot: order.appointmentTimeSlot || "",
    outsideAddress: order.outsideAddress || "",
    status: record.status,
    photoStages: (record.photos || []).map((photo) => photo.stage).filter(Boolean)
  };
}

function normalizeAssignmentsResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function toTaskListItem(task) {
  const schedule = [
    [task.appointmentDate, task.appointmentTimeSlot].filter(Boolean).join(" "),
    task.constructionLocation,
    task.outsideAddress
  ].filter(Boolean).join(" · ");
  const photoCount = ["BEFORE", "DURING", "AFTER"].filter((stage) => (task.photoStages || []).includes(stage)).length;
  return {
    id: task.id,
    title: `${task.orderNo} · ${task.customerName}`,
    meta: task.vehicleLabel,
    schedule,
    statusLabel: STATUS_LABELS[task.status] || task.status,
    photoProgress: `照片 ${photoCount}/3`
  };
}

function getConstructionTypeLabel(value) {
  return {
    PPF: "漆面保护膜",
    COLOR_FILM: "改色膜",
    HEAT_FILM: "玻璃膜",
    INSPECTION: "复检"
  }[value] || value || "施工类型待同步";
}

function getConstructionLocationLabel(value) {
  return {
    IN_STORE: "到店",
    OUTSIDE: "外出"
  }[value] || value || "施工地点待同步";
}
