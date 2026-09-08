import type { RuntimePermission } from "./management-menu";

type PermissionRequirement = { code: string; action: string };

export type WorkbenchAction = {
  label: string;
  description: string;
  href: string;
  primary?: boolean;
  anyOf: PermissionRequirement[];
};

export type WorkbenchSection = {
  title: string;
  description: string;
  items: WorkbenchAction[];
};

export function getStoreWorkbenchHref(storeId: string) {
  return `/workbench/${storeId}`;
}

const sections: WorkbenchSection[] = [
  {
    title: "客户与销售",
    description: "客户档案、订单和经营数据",
    items: [
      { label: "新建订单", description: "为客户选择产品、施工方式并录入费用", href: "/orders/create", primary: true, anyOf: [{ code: "orders", action: "write" }] },
      { label: "订单管理", description: "查看销售订单、施工状态和收款进度", href: "/orders", anyOf: [{ code: "orders", action: "read" }] },
      { label: "客户管理", description: "维护客户档案、车辆并快速下单", href: "/customers", anyOf: [{ code: "customers", action: "read" }] },
      { label: "报表分析", description: "查看门店经营关键指标", href: "/reports", anyOf: [{ code: "reports", action: "read" }] },
      { label: "返利管理", description: "提交、审核或发放返利", href: "/rebates", anyOf: [{ code: "rebates", action: "read" }] }
    ]
  },
  {
    title: "履约与供应链",
    description: "产品、施工、库存、采购、质保与售后",
    items: [
      { label: "产品管理", description: "维护可下单产品、价格和状态", href: "/products", primary: true, anyOf: [{ code: "products", action: "read" }] },
      { label: "施工容量", description: "维护每日施工容量和预约上限", href: "/construction/capacities", anyOf: [{ code: "construction", action: "read" }] },
      { label: "施工派单", description: "处理待派工订单和施工进度", href: "/construction/assignments", anyOf: [{ code: "construction", action: "write" }] },
      { label: "施工排班", description: "查看施工团队并设置每日排班", href: "/construction/schedules", anyOf: [{ code: "construction", action: "read" }] },
      { label: "我的施工任务", description: "查看施工任务、开工完工和照片凭证", href: "/construction/tasks", anyOf: [{ code: "construction", action: "read" }] },
      { label: "施工档案", description: "查看施工记录、照片和质检档案", href: "/construction/profile", anyOf: [{ code: "construction", action: "read" }] },
      { label: "库存管理", description: "查看库存健康、批次、锁库出库和库存流水", href: "/inventory", anyOf: [{ code: "inventory", action: "read" }] },
      { label: "采购管理", description: "处理采购需求、采购订单、到货验收和供应商", href: "/purchases", anyOf: [{ code: "purchase", action: "read" }] },
      { label: "质保管理", description: "从已完工订单生成和查询质保", href: "/warranties", anyOf: [{ code: "warranties", action: "read" }] },
      { label: "售后管理", description: "售后申请、派单和责任判断", href: "/after-sales", anyOf: [{ code: "after-sales", action: "read" }] }
    ]
  },
  {
    title: "财务与经营",
    description: "费用、提成、发票和经营结算",
    items: [
      { label: "财务管理", description: "费用、报销、流水和打款", href: "/finance", primary: true, anyOf: [{ code: "finance", action: "read" }, { code: "finance.application", action: "submit" }] },
      { label: "提成管理", description: "销售和师傅提成规则与快照", href: "/commissions", anyOf: [{ code: "commissions", action: "write" }] },
      { label: "发票管理", description: "发票申请、开具、作废和重开", href: "/invoices", anyOf: [{ code: "finance", action: "read" }] }
    ]
  }
];

function hasPermission(permissions: RuntimePermission[], requirement: PermissionRequirement) {
  return permissions.some((permission) => permission.code === requirement.code && permission.actions.includes(requirement.action));
}

/** Workbench shortcuts are a presentation of the effective permission snapshot, never a StoreMember position. */
export function getWorkbenchSections(permissions: RuntimePermission[] | undefined, storeId: string): WorkbenchSection[] {
  if (!permissions) return [];
  return sections
    .map((section) => ({ ...section, items: section.items.filter((item) => item.anyOf.some((requirement) => hasPermission(permissions, requirement))) }))
    .filter((section) => section.items.length > 0)
    .map((section) => ({ ...section, items: section.items.map((item) => ({ ...item, href: item.href === "/workbench" ? getStoreWorkbenchHref(storeId) : item.href })) }));
}
