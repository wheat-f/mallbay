export type StorePosition =
  | "MANAGER"
  | "SALES"
  | "CUSTOMER_SERVICE"
  | "PURCHASING"
  | "FINANCE"
  | "SCHEDULER"
  | "CONSTRUCTION"
  | "APPRENTICE";

export type WorkbenchAction = {
  label: string;
  description: string;
  href: string;
  primary?: boolean;
};

export type WorkbenchSection = {
  title: string;
  description: string;
  items: WorkbenchAction[];
};

export function getStoreWorkbenchHref(storeId: string) {
  return `/workbench/${storeId}`;
}

const salesActions: WorkbenchAction[] = [
  { label: "新建订单", description: "为客户选择产品、施工方式并录入费用", href: "/orders/create", primary: true },
  { label: "订单管理", description: "查看销售订单、施工状态和收款进度", href: "/orders" },
  { label: "客户管理", description: "维护客户档案、车辆并快速下单", href: "/customers" },
  { label: "我的业绩", description: "查看自己的订单、回款和销售提成", href: "/reports" }
];

const managerExtraActions: WorkbenchAction[] = [
  { label: "产品管理", description: "维护可下单产品、价格和状态", href: "/products" },
  { label: "施工容量", description: "维护每日施工容量和预约上限", href: "/construction/capacities" },
  { label: "施工派单", description: "处理待派工订单和施工进度", href: "/construction/assignments" },
  { label: "库存采购", description: "管理产品批次、锁库和采购需求", href: "/inventory" },
  { label: "质保管理", description: "从已完工订单生成和查询质保", href: "/warranties" },
  { label: "售后管理", description: "售后申请、派单和责任判断", href: "/after-sales" },
  { label: "提成管理", description: "销售和师傅提成规则与快照", href: "/commissions" },
  { label: "财务管理", description: "费用、报销、流水和打款", href: "/finance" },
  { label: "发票管理", description: "发票申请、开具、作废和重开", href: "/invoices" },
  { label: "返利管理", description: "返利申请、审核和发放", href: "/rebates" },
  { label: "经营报表", description: "查看门店经营关键指标", href: "/reports" }
];

export function getWorkbenchSections(position: StorePosition, storeId: string): WorkbenchSection[] {
  if (position === "SALES") {
    return [{ title: "销售工作", description: "客户、订单和收款跟进", items: salesActions }];
  }

  if (position === "MANAGER") {
    return [
      { title: "销售工作", description: "客户、订单和产品", items: [...salesActions, { label: "产品管理", description: "维护可下单产品、价格和状态", href: "/products" }] },
      { title: "门店履约", description: "施工、库存、质保和售后", items: managerExtraActions.filter((item) => !["产品管理", "财务管理", "发票管理", "返利管理", "经营报表"].includes(item.label)) },
      { title: "经营管理", description: "财务、返利、发票和报表", items: managerExtraActions.filter((item) => ["财务管理", "发票管理", "返利管理", "经营报表"].includes(item.label)) }
    ];
  }

  if (position === "CUSTOMER_SERVICE") {
    return [{
      title: "客服协同",
      description: "客户、订单、库存、质保、售后和返利申请",
      items: [
        { label: "客户管理", description: "维护客户档案、车辆和沟通记录", href: "/customers", primary: true },
        { label: "订单管理", description: "查看本店订单并跟进收款和履约", href: "/orders" },
        { label: "新建订单", description: "为客户选择产品、施工方式并录入费用", href: "/orders/create" },
        { label: "库存采购", description: "按订单匹配库存、锁定批次或生成采购需求", href: "/inventory" },
        { label: "质保管理", description: "从已完工订单生成和查询质保", href: "/warranties" },
        { label: "售后管理", description: "售后申请、派单协同和责任跟进", href: "/after-sales" },
        { label: "返利管理", description: "为订单提交返利申请并查看进度", href: "/rebates" }
      ]
    }];
  }

  if (position === "SCHEDULER") {
    return [{
      title: "施工主管",
      description: "容量、派单、任务和质检",
      items: [
        { label: "施工容量", description: "维护每日施工容量和预约上限", href: "/construction/capacities", primary: true },
        { label: "施工派单", description: "处理待派工订单和施工进度", href: "/construction/assignments" },
        { label: "售后管理", description: "售后派单和责任判断", href: "/after-sales" },
        { label: "质保管理", description: "查看施工质保记录", href: "/warranties" }
      ]
    }];
  }

  if (position === "CONSTRUCTION" || position === "APPRENTICE") {
    return [{
      title: "施工任务",
      description: "查看分配给自己的任务并上传施工照片",
      items: [{ label: "我的施工任务", description: "开工、完工和施工拍照", href: "/construction/tasks", primary: true }]
    }];
  }

  if (position === "PURCHASING") {
    return [{
      title: "采购库存",
      description: "库存、采购和相关费用",
      items: [
        { label: "库存采购", description: "管理产品批次、锁库和采购需求", href: "/inventory", primary: true },
        { label: "产品管理", description: "查看产品基础资料", href: "/products" },
        { label: "财务管理", description: "提交费用和报销申请", href: "/finance" }
      ]
    }];
  }

  if (position === "FINANCE") {
    return [{
      title: "财务工作",
      description: "收款、费用、发票、返利和报表",
      items: [
        { label: "订单管理", description: "查看订单收款状态", href: "/orders" },
        { label: "财务管理", description: "费用、报销、流水和打款", href: "/finance", primary: true },
        { label: "发票管理", description: "发票申请、开具、作废和重开", href: "/invoices" },
        { label: "返利管理", description: "返利审核和发放", href: "/rebates" },
        { label: "经营报表", description: "查看门店经营关键指标", href: "/reports" }
      ]
    }];
  }

  return [{
    title: "门店工作",
    description: "当前岗位可访问的业务入口",
    items: [{ label: "返回门店", description: "查看门店信息", href: getStoreWorkbenchHref(storeId) }]
  }];
}
