/* global Page, wx */

const SCHEDULE_CACHE_KEY = "mallbay_construction_schedules";
const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";
const STORE_ID_KEY = "mallbay_store_id";

const STATUS_LABELS = {
  WORKING: "店内排班",
  OUTSIDE: "外出施工",
  REST: "休息"
};

Page({
  data: {
    selectedDate: getToday(),
    schedules: [],
    syncing: false,
    emptyText: "暂无缓存排班，请联网同步后查看"
  },

  onShow() {
    this.loadCachedSchedules();
  },

  onDateChange(event) {
    this.setData({ selectedDate: event.detail.value });
    this.loadCachedSchedules(event.detail.value);
  },

  syncSchedules() {
    const apiBaseUrl = wx.getStorageSync(API_BASE_URL_KEY);
    const token = wx.getStorageSync(AUTH_TOKEN_KEY);
    const storeId = wx.getStorageSync(STORE_ID_KEY);
    if (!apiBaseUrl || !token || !storeId) {
      wx.showToast({ title: "请先配置连接", icon: "none" });
      wx.navigateTo({ url: "/pages/settings/index" });
      return;
    }

    const date = this.data.selectedDate;
    this.setData({ syncing: true });
    wx.request({
      url: `${apiBaseUrl}/construction/schedules?storeId=${encodeURIComponent(storeId)}&from=${encodeURIComponent(date)}&to=${encodeURIComponent(date)}`,
      method: "GET",
      header: { Authorization: `Bearer ${token}` },
      success: (response) => {
        const records = normalizeSchedulesResponse(response.data);
        const allSchedules = mergeSchedules(wx.getStorageSync(SCHEDULE_CACHE_KEY) || [], records);
        wx.setStorageSync(SCHEDULE_CACHE_KEY, allSchedules);
        this.setData({ schedules: records.map(toScheduleListItem) });
        wx.showToast({ title: "排班已同步", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "同步失败", icon: "none" });
      },
      complete: () => {
        this.setData({ syncing: false });
      }
    });
  },

  loadCachedSchedules(date = this.data.selectedDate) {
    const cached = wx.getStorageSync(SCHEDULE_CACHE_KEY) || [];
    this.setData({
      schedules: cached
        .filter((item) => getDateOnly(item.date) === date)
        .map(toScheduleListItem)
    });
  }
});

function normalizeSchedulesResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function mergeSchedules(cached, records) {
  const byId = new Map(cached.map((item) => [item.id, item]));
  records.forEach((item) => byId.set(item.id, item));
  return Array.from(byId.values()).sort((a, b) => getDateOnly(a.date).localeCompare(getDateOnly(b.date)));
}

function toScheduleListItem(item) {
  return {
    id: item.id,
    date: getDateOnly(item.date),
    statusLabel: STATUS_LABELS[item.status] || "排班待确认",
    note: item.note && item.note.trim() ? item.note.trim() : getFallbackNote(item.status),
    workerName: (item.worker && (item.worker.nickname || item.worker.username)) || "我的排班"
  };
}

function getFallbackNote(status) {
  if (status === "WORKING") return "店内可施工";
  if (status === "OUTSIDE") return "外出施工";
  if (status === "REST") return "休息";
  return "排班待确认";
}

function getDateOnly(value) {
  return String(value || "").slice(0, 10);
}

function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const date = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}
