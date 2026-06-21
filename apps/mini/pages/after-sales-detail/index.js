/* global Page, wx */

const AFTER_SALES_CACHE_KEY = "mallbay_after_sales_tasks";

const STATUS_LABELS = {
  OPEN: "待处理",
  ASSIGNED: "处理中",
  RESOLVED: "已解决",
  CLOSED: "已关闭"
};

const RESPONSIBILITY_LABELS = {
  PENDING: "待判定",
  CUSTOMER: "客户原因",
  CONSTRUCTION: "施工责任",
  MATERIAL: "材料责任",
  STORE: "门店责任"
};

Page({
  data: {
    task: null,
    emptyText: "未找到售后任务，请返回列表重新同步"
  },

  onLoad(options) {
    const records = wx.getStorageSync(AFTER_SALES_CACHE_KEY) || [];
    const task = records.find((item) => item.id === options.id);
    this.setData({ task: task ? toDetail(task) : null });
  },

  backToList() {
    wx.navigateBack({ delta: 1 });
  }
});

function toDetail(item) {
  const order = item.order || {};
  const vehicle = order.vehicle || {};
  const customer = order.customer || {};
  return {
    id: item.id,
    title: vehicle.model || vehicle.carModel || vehicle.plateNo || item.description || "售后任务",
    statusLabel: STATUS_LABELS[item.status] || "状态待确认",
    responsibilityLabel: RESPONSIBILITY_LABELS[item.responsibility] || "责任待确认",
    orderLabel: order.orderNo || "订单信息待确认",
    customerLabel: customer.name || "客户信息待确认",
    vehicleLabel: [vehicle.plateNo, vehicle.brand, vehicle.model || vehicle.carModel].filter(Boolean).join(" / ") || "车辆信息待确认",
    description: item.description || "暂无售后描述",
    warrantyLabel: item.warrantyId ? "已关联质保单" : "质保单待关联"
  };
}
