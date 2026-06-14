"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button, Empty, Tag } from "antd";
import {
  AppstoreOutlined,
  BellOutlined,
  CheckCircleOutlined,
  CustomerServiceOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  ToolOutlined,
  UserOutlined,
  WarningOutlined
} from "@ant-design/icons";
import type { AfterSaleStatus, AfterSaleSummary } from "@mallbay/shared";
import { useQuery } from "@tanstack/react-query";
import { afterSalesApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import {
  getAfterSaleOrderLabel,
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel
} from "../../../src/features/after-sales/display";

type MobileAfterSaleTab = "pending" | "processing" | "done";

const tabs: Array<{ key: MobileAfterSaleTab; label: string; statuses: AfterSaleStatus[] }> = [
  { key: "pending", label: "待处理", statuses: ["OPEN"] },
  { key: "processing", label: "处理中", statuses: ["ASSIGNED"] },
  { key: "done", label: "已完成", statuses: ["RESOLVED", "CLOSED"] }
];

export default function AfterSalesMobileTasksPage() {
  const [activeTab, setActiveTab] = useState<MobileAfterSaleTab>("pending");
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

  const listQuery = useQuery({
    queryKey: ["after-sales-mobile-tasks", storeId],
    queryFn: () => afterSalesApi.list(storeId!),
    enabled: Boolean(storeId)
  });

  const rows = useMemo(() => (listQuery.data ?? []) as AfterSaleSummary[], [listQuery.data]);
  const counts = {
    pending: rows.filter((item) => item.status === "OPEN").length,
    processing: rows.filter((item) => item.status === "ASSIGNED").length,
    done: rows.filter((item) => item.status === "RESOLVED" || item.status === "CLOSED").length
  };
  const activeStatuses = tabs.find((item) => item.key === activeTab)?.statuses ?? [];
  const visibleRows = rows.filter((item) => activeStatuses.includes(item.status));

  return (
    <main className="after-sales-mobile-shell">
      <header className="after-sales-mobile-header">
        <div>
          <CustomerServiceOutlined />
          <h1>售后任务中心</h1>
        </div>
        <div className="after-sales-mobile-header-actions">
          <SearchOutlined />
          <BellOutlined />
          <span>{user?.nickname?.charAt(0) ?? user?.username?.charAt(0) ?? "用"}</span>
        </div>
      </header>

      <section className="after-sales-mobile-hero">
        <div>
          <span>今日待处理任务</span>
          <strong>{counts.pending}</strong>
          <em>个工单</em>
        </div>
        <Tag className="after-sales-mobile-sync">实时同步中</Tag>
      </section>

      <nav className="after-sales-mobile-tabs" aria-label="售后任务状态">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? "is-active" : undefined}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label} ({counts[tab.key]})
          </button>
        ))}
      </nav>

      <section className="after-sales-mobile-list">
        {listQuery.isLoading ? <div className="after-sales-mobile-loading">售后任务加载中...</div> : null}
        {!listQuery.isLoading && visibleRows.length === 0 ? <Empty description="暂无售后任务" /> : null}
        {visibleRows.map((item) => (
          <article key={item.id} className="after-sales-mobile-card">
            <div className="after-sales-mobile-card-head">
              <Tag className={getAfterSaleStatusClassName(item.status)} icon={item.status === "OPEN" ? <WarningOutlined /> : <ToolOutlined />}>
                {getAfterSaleStatusLabel(item.status)}
              </Tag>
              <span>{getRelativeTaskTime(item.status)}</span>
            </div>

            <div className="after-sales-mobile-card-main">
              <div className="after-sales-mobile-car-thumb">
                <ToolOutlined />
              </div>
              <div>
                <h2>{getMobileAfterSaleTitle(item)}</h2>
                <p>{getAfterSaleOrderLabel(item)}</p>
              </div>
            </div>

            <div className="after-sales-mobile-warranty">
              <CheckCircleOutlined />
              <span>{item.warrantyId ? `质保单：${item.warrantyId}` : "质保单待关联"}</span>
              <em>{getAfterSaleResponsibilityLabel(item.responsibility)}</em>
            </div>

            <div className="after-sales-mobile-actions">
              <Button href="/after-sales">查看详情</Button>
              <Button type="primary" icon={<PlayCircleOutlined />} href="/after-sales">
                立即处理
              </Button>
            </div>
          </article>
        ))}
      </section>

      <nav className="after-sales-mobile-bottom-nav" aria-label="售后移动端导航">
        <Link href="/workbench">
          <AppstoreOutlined />
          <span>控制台</span>
        </Link>
        <Link href="/construction/tasks">
          <ToolOutlined />
          <span>施工管理</span>
        </Link>
        <Link className="is-create" href="/after-sales">
          <PlusOutlined />
        </Link>
        <Link className="is-active" href="/after-sales/tasks">
          <CustomerServiceOutlined />
          <span>售后服务</span>
        </Link>
        <Link href="/construction/profile">
          <UserOutlined />
          <span>个人中心</span>
        </Link>
      </nav>
    </main>
  );
}

function getMobileAfterSaleTitle(item: AfterSaleSummary) {
  const vehicle = item.order?.vehicle;
  return vehicle?.model ?? vehicle?.carModel ?? vehicle?.plateNo ?? item.description;
}

function getAfterSaleStatusClassName(status: AfterSaleStatus) {
  if (status === "OPEN") return "after-sales-mobile-status is-pending";
  if (status === "ASSIGNED") return "after-sales-mobile-status is-processing";
  return "after-sales-mobile-status is-done";
}

function getRelativeTaskTime(status: AfterSaleStatus) {
  if (status === "OPEN") return "30分钟前";
  if (status === "ASSIGNED") return "处理中";
  return "已完成";
}
