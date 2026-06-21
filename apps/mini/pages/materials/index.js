/* global Page, wx */

const TASK_CACHE_KEY = "mallbay_construction_tasks";

const materialBatches = [
  {
    batchNo: "B-XU-230915-008",
    product: "XPEL Ultimate Plus",
    spec: "1.52m x 15m / 透明膜",
    status: "待扫码",
    location: "A库-PPF-02"
  },
  {
    batchNo: "B-LM-240118-021",
    product: "龙膜 G2 前挡玻璃膜",
    spec: "1.52m x 30m / 隔热膜",
    status: "已核验",
    location: "车间临时架"
  }
];

const consumables = ["裁膜刀片", "刮板毛毡", "安装液", "无尘布"];

Page({
  data: {
    currentTask: null,
    batches: materialBatches,
    consumables
  },

  onShow() {
    const tasks = wx.getStorageSync(TASK_CACHE_KEY) || [];
    this.setData({ currentTask: tasks[0] || null });
  },

  openTasks() {
    wx.navigateBack({ delta: 1 });
  },

  openTaskDetail() {
    if (!this.data.currentTask || !this.data.currentTask.id) {
      wx.showToast({ title: "暂无缓存任务", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/task-detail/index?id=${this.data.currentTask.id}` });
  }
});
