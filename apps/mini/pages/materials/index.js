/* global Page, wx */

const TASK_CACHE_KEY = "mallbay_construction_tasks";
const MATERIAL_CACHE_KEY_PREFIX = "mallbay_construction_materials_";
const API_BASE_URL_KEY = "mallbay_api_base_url";
const AUTH_TOKEN_KEY = "mallbay_access_token";

Page({
  data: {
    tasks: [],
    taskOptions: [],
    selectedTaskIndex: 0,
    currentTask: null,
    materials: [],
    summary: null,
    syncing: false,
    emptyText: "暂无锁定物料，请先同步施工任务或完成库存匹配"
  },

  onShow() {
    const tasks = wx.getStorageSync(TASK_CACHE_KEY) || [];
    const selectedTaskIndex = Math.min(this.data.selectedTaskIndex || 0, Math.max(tasks.length - 1, 0));
    const currentTask = tasks[selectedTaskIndex] || null;
    this.setData({
      tasks,
      taskOptions: tasks.map(toTaskOption),
      selectedTaskIndex,
      currentTask
    });
    this.loadCachedMaterials(currentTask && currentTask.orderId);
  },

  onTaskChange(event) {
    const selectedTaskIndex = Number(event.detail.value || 0);
    const currentTask = this.data.tasks[selectedTaskIndex] || null;
    this.setData({
      selectedTaskIndex,
      currentTask
    });
    this.loadCachedMaterials(currentTask && currentTask.orderId);
  },

  syncMaterials() {
    const task = this.data.currentTask;
    if (!task || !task.orderId) {
      wx.showToast({ title: "暂无施工任务", icon: "none" });
      return;
    }
    const apiBaseUrl = wx.getStorageSync(API_BASE_URL_KEY);
    const token = wx.getStorageSync(AUTH_TOKEN_KEY);
    if (!apiBaseUrl || !token) {
      wx.showToast({ title: "请先配置连接", icon: "none" });
      wx.navigateTo({ url: "/pages/settings/index" });
      return;
    }
    this.setData({ syncing: true });
    wx.request({
      url: `${apiBaseUrl}/construction/orders/${encodeURIComponent(task.orderId)}/materials`,
      method: "GET",
      header: { Authorization: `Bearer ${token}` },
      success: (response) => {
        const materials = normalizeMaterialsResponse(response.data);
        wx.setStorageSync(`${MATERIAL_CACHE_KEY_PREFIX}${task.orderId}`, response.data);
        this.setData(materials);
        wx.showToast({ title: "物料已同步", icon: "success" });
      },
      fail: () => {
        wx.showToast({ title: "同步失败", icon: "none" });
      },
      complete: () => {
        this.setData({ syncing: false });
      }
    });
  },

  loadCachedMaterials(orderId) {
    if (!orderId) {
      this.setData({ materials: [], summary: null });
      return;
    }
    const cached = wx.getStorageSync(`${MATERIAL_CACHE_KEY_PREFIX}${orderId}`);
    this.setData(normalizeMaterialsResponse(cached));
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

function toTaskOption(task) {
  return [task.orderNo || task.orderId || "施工任务", task.customerName, task.vehicleLabel]
    .filter(Boolean)
    .join(" · ");
}

function normalizeMaterialsResponse(data) {
  const materials = Array.isArray(data && data.materials) ? data.materials : [];
  return {
    summary: data && data.summary ? data.summary : null,
    materials: materials.map((item) => ({
      orderItemId: item.orderItemId,
      productLabel: item.productLabel,
      requiredQuantity: item.requiredQuantity,
      unit: item.unit,
      batches: Array.isArray(item.batches) ? item.batches.map((batch) => ({
        allocationId: batch.allocationId,
        batchNo: batch.batchNo,
        supplierName: batch.supplierName || "供应商待确认",
        lockedQuantity: batch.lockedQuantity,
        unit: batch.unit,
        statusLabel: batch.verified ? "已核验" : "待扫码",
        pickupLabel: batch.pickedUp ? "已领取" : "待领取"
      })) : []
    }))
  };
}
