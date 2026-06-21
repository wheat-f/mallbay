/* global Page, wx */

const AFTER_SALES_CACHE_KEY = "mallbay_after_sales_tasks";
const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";
const STORE_ID_KEY = "mallbay_store_id";

const STATUS_LABELS = {
  OPEN: "待处理",
  ASSIGNED: "处理中",
  RESOLVED: "已解决",
  CLOSED: "已关闭"
};

Page({
  data: {
    tasks: [],
    syncing: false,
    emptyText: "暂无缓存售后任务，请联网同步后查看"
  },

  onShow() {
    const cached = wx.getStorageSync(AFTER_SALES_CACHE_KEY) || [];
    this.setData({ tasks: cached.map(toTaskItem) });
  },

  syncAfterSales() {
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
      url: `${apiBaseUrl}/after-sales?storeId=${encodeURIComponent(storeId)}`,
      method: "GET",
      header: { Authorization: `Bearer ${token}` },
      success: (response) => {
        const records = normalizeAfterSalesResponse(response.data);
        wx.setStorageSync(AFTER_SALES_CACHE_KEY, records);
        this.setData({ tasks: records.map(toTaskItem) });
        wx.showToast({ title: "售后任务已同步", icon: "success" });
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

function normalizeAfterSalesResponse(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

function toTaskItem(item) {
  const vehicle = item.order && item.order.vehicle ? item.order.vehicle : {};
  return {
    id: item.id,
    title: vehicle.model || vehicle.carModel || vehicle.plateNo || item.description || "售后任务",
    orderLabel: item.order && item.order.orderNo ? item.order.orderNo : "订单信息待确认",
    statusLabel: STATUS_LABELS[item.status] || "状态待确认",
    warrantyLabel: item.warrantyId ? "已关联质保单" : "质保单待关联"
  };
}
