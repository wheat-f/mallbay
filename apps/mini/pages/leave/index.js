/* global Page, wx */

const OFFLINE_QUEUE_KEY = "mallbay_offline_queue";
const STORE_ID_KEY = "mallbay_store_id";
const MAX_OFFLINE_QUEUE_ITEMS = 100;

Page({
  data: {
    startDate: "",
    endDate: "",
    reason: ""
  },

  onStartDateChange(event) {
    this.setData({ startDate: event.detail.value });
  },

  onEndDateChange(event) {
    this.setData({ endDate: event.detail.value });
  },

  onReasonInput(event) {
    this.setData({ reason: event.detail.value });
  },

  submitLeaveRequest() {
    const storeId = wx.getStorageSync(STORE_ID_KEY);
    if (!storeId) {
      wx.showToast({ title: "请先配置门店", icon: "none" });
      wx.navigateTo({ url: "/pages/settings/index" });
      return;
    }
    if (!this.data.startDate || !this.data.endDate) {
      wx.showToast({ title: "请选择请假日期", icon: "none" });
      return;
    }
    if (this.data.endDate < this.data.startDate) {
      wx.showToast({ title: "结束日期不能早于开始日期", icon: "none" });
      return;
    }

    const queue = wx.getStorageSync(OFFLINE_QUEUE_KEY) || [];
    if (queue.length >= MAX_OFFLINE_QUEUE_ITEMS) {
      wx.showToast({ title: "本地缓存已达上限，请联网同步后再继续操作", icon: "none" });
      return;
    }

    const operation = {
      id: `offline_${Date.now()}`,
      type: "LEAVE_REQUEST",
      payload: {
        storeId,
        startDate: this.data.startDate,
        endDate: this.data.endDate,
        reason: this.data.reason
      },
      attempts: 0,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    wx.setStorageSync(OFFLINE_QUEUE_KEY, queue.concat(operation));
    wx.showToast({ title: "请假已加入离线队列", icon: "success" });
    this.setData({ startDate: "", endDate: "", reason: "" });
  }
});
