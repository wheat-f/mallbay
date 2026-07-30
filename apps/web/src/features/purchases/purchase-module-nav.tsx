"use client";

import {
  CheckCircleOutlined,
  HomeOutlined,
  RollbackOutlined,
  ShoppingCartOutlined,
  TeamOutlined
} from "@ant-design/icons";
import Link from "next/link";
import { usePathname } from "next/navigation";

const PURCHASE_MODULE_NAV_ITEMS = [
  {
    key: "overview",
    href: "/purchases",
    label: "采购总览",
    description: "需求、订单、到货和供应商总览",
    icon: <HomeOutlined />
  },
  {
    key: "requirements",
    href: "/purchases/requirements",
    label: "采购需求",
    description: "缺货需求、人工申请和转采购单",
    icon: <CheckCircleOutlined />
  },
  {
    key: "orders",
    href: "/purchases/orders",
    label: "采购订单",
    description: "审批、取消、到货验收和订单明细",
    icon: <ShoppingCartOutlined />
  },
  {
    key: "returns",
    href: "/returns",
    label: "退货处理",
    description: "销售退货、采购退货和结算",
    icon: <RollbackOutlined />
  },
  {
    key: "suppliers",
    href: "/purchases/suppliers",
    label: "供应商档案",
    description: "联系人、评级和合作历史",
    icon: <TeamOutlined />
  }
] as const;

export function PurchaseModuleNav({ activeKey }: { activeKey?: string }) {
  const pathname = usePathname();
  const resolvedActiveKey = activeKey ?? resolveActiveKey(pathname);

  return (
    <aside className="purchase-module-nav" aria-label="采购管理功能导航">
      <div className="purchase-module-nav-title">采购管理</div>
      <nav>
        {PURCHASE_MODULE_NAV_ITEMS.map((item) => (
          <Link
            key={item.key}
            className={item.key === resolvedActiveKey ? "is-active" : undefined}
            href={item.href}
            aria-current={item.key === resolvedActiveKey ? "page" : undefined}
          >
            {item.icon}
            <span>
              <strong>{item.label}</strong>
              <small>{item.description}</small>
            </span>
          </Link>
        ))}
      </nav>
    </aside>
  );
}

function resolveActiveKey(pathname: string | null) {
  if (!pathname || pathname === "/purchases") return "overview";
  if (pathname.startsWith("/purchases/requirements")) return "requirements";
  if (pathname.startsWith("/purchases/inbound")) return "orders";
  if (pathname.startsWith("/purchases/suppliers")) return "suppliers";
  if (pathname.startsWith("/returns")) return "returns";
  if (pathname.startsWith("/purchases/orders")) return "orders";
  return "overview";
}
