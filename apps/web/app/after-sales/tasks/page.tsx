"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Button, Card, Empty, Space, Table, Tag } from "antd";
import {
  CheckCircleOutlined,
  CustomerServiceOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  ToolOutlined,
  WarningOutlined
} from "@ant-design/icons";
import type { AfterSaleStatus, AfterSaleSummary } from "@mallbay/shared";
import { useQuery } from "@tanstack/react-query";
import { afterSalesApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import {
  getAfterSaleOrderLabel,
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel
} from "../../../src/features/after-sales/display";

type AfterSaleTaskTab = "pending" | "processing" | "done";

const tabs: Array<{ key: AfterSaleTaskTab; label: string; statuses: AfterSaleStatus[] }> = [
  { key: "pending", label: "待处理", statuses: ["OPEN"] },
  { key: "processing", label: "处理中", statuses: ["ASSIGNED"] },
  { key: "done", label: "已完成", statuses: ["RESOLVED", "CLOSED"] }
];

const taskImages = [
  "/prototype-assets/after-sales-task-1.png",
  "/prototype-assets/after-sales-task-2.png"
];

export default function AfterSalesTasksPage() {
  const [activeTab, setActiveTab] = useState<AfterSaleTaskTab>("pending");
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;

  const listQuery = useQuery({
    queryKey: ["after-sales-tasks", storeId],
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
    <div className="management-page worker-after-sales-task-page">
      <StorePageHeader title="售后任务中心" description="统一查看待处理、处理中和已完成的售后服务工单。">
        <Button icon={<ReloadOutlined />} onClick={() => listQuery.refetch()}>
          刷新任务
        </Button>
        <Button type="primary" href="/after-sales" icon={<CustomerServiceOutlined />}>
          返回售后工作台
        </Button>
      </StorePageHeader>

      <section className="worker-after-sales-hero">
        <div>
          <Tag color="error" icon={<WarningOutlined />}>今日待处理任务</Tag>
          <strong>{counts.pending}</strong>
          <span>个工单需要跟进</span>
        </div>
        <p>优先处理开放工单，进入详情后完成责任判定、处罚记录和质保关联。</p>
      </section>

      <section className="worker-after-sales-kpis">
        {tabs.map((tab) => (
          <article key={tab.key}>
            <span>{tab.label}</span>
            <strong>{counts[tab.key]}</strong>
          </article>
        ))}
      </section>

      <nav className="worker-after-sales-tabs" aria-label="售后任务状态">
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

      <Card className="worker-after-sales-table" title="任务明细">
        <Table<AfterSaleSummary>
          rowKey="id"
          loading={listQuery.isLoading}
          dataSource={visibleRows}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无售后任务" /> }}
          columns={[
            {
              title: "现场",
              render: (_, item) => (
                <Space>
                  <Image
                    className="worker-after-sales-car-image"
                    src={getAfterSalesTaskImage(item)}
                    alt={`${getMobileAfterSaleTitle(item)} 售后现场`}
                    width={48}
                    height={48}
                    sizes="48px"
                    unoptimized
                  />
                  <div className="worker-after-sales-ticket-title">
                    <strong>{getMobileAfterSaleTitle(item)}</strong>
                    <span>{getAfterSaleOrderLabel(item)}</span>
                  </div>
                </Space>
              )
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (status: AfterSaleStatus) => (
                <Tag className={getAfterSaleStatusClassName(status)} icon={status === "OPEN" ? <WarningOutlined /> : <ToolOutlined />}>
                  {getAfterSaleStatusLabel(status)}
                </Tag>
              )
            },
            {
              title: "质保",
              render: (_, item) => item.warrantyId ? "已关联质保单" : "质保单待关联"
            },
            {
              title: "责任",
              render: (_, item) => getAfterSaleResponsibilityLabel(item.responsibility)
            },
            {
              title: "时效",
              render: (_, item) => getRelativeTaskTime(item.status)
            },
            {
              title: "操作",
              render: (_, item) => (
                <Space>
                  <Button href={`/after-sales/${item.id}`}>查看详情</Button>
                  <Button type="primary" icon={<PlayCircleOutlined />} href={`/after-sales/${item.id}`}>
                    立即处理
                  </Button>
                </Space>
              )
            }
          ]}
        />

        <div className="worker-after-sales-mobile-cards">
          {listQuery.isLoading ? <div className="worker-after-sales-loading">售后任务加载中...</div> : null}
          {!listQuery.isLoading && visibleRows.length === 0 ? <Empty description="暂无售后任务" /> : null}
          {visibleRows.map((item) => (
            <article key={item.id} className="worker-after-sales-card">
              <div className="worker-after-sales-card-head">
                <Tag className={getAfterSaleStatusClassName(item.status)} icon={item.status === "OPEN" ? <WarningOutlined /> : <ToolOutlined />}>
                  {getAfterSaleStatusLabel(item.status)}
                </Tag>
                <span>{getRelativeTaskTime(item.status)}</span>
              </div>
              <div className="worker-after-sales-card-main">
                <Image
                  className="worker-after-sales-car-image"
                  src={getAfterSalesTaskImage(item)}
                  alt={`${getMobileAfterSaleTitle(item)} 售后现场`}
                  width={72}
                  height={72}
                  sizes="72px"
                  unoptimized
                />
                <div>
                  <h2>{getMobileAfterSaleTitle(item)}</h2>
                  <p>{getAfterSaleOrderLabel(item)}</p>
                </div>
              </div>
              <div className="worker-after-sales-warranty">
                <CheckCircleOutlined />
                <span>{item.warrantyId ? "已关联质保单" : "质保单待关联"}</span>
                <em>{getAfterSaleResponsibilityLabel(item.responsibility)}</em>
              </div>
              <div className="worker-after-sales-actions">
                <Button href={`/after-sales/${item.id}`}>查看详情</Button>
                <Button type="primary" icon={<PlayCircleOutlined />} href={`/after-sales/${item.id}`}>
                  立即处理
                </Button>
              </div>
            </article>
          ))}
        </div>
      </Card>
    </div>
  );
}

function getAfterSalesTaskImage(item: AfterSaleSummary) {
  if (item.description.includes("划痕")) return taskImages[1];
  return taskImages[0];
}

function getMobileAfterSaleTitle(item: AfterSaleSummary) {
  const vehicle = item.order?.vehicle;
  return vehicle?.model ?? vehicle?.carModel ?? vehicle?.plateNo ?? item.description;
}

function getAfterSaleStatusClassName(status: AfterSaleStatus) {
  if (status === "OPEN") return "worker-after-sales-status is-pending";
  if (status === "ASSIGNED") return "worker-after-sales-status is-processing";
  return "worker-after-sales-status is-done";
}

function getRelativeTaskTime(status: AfterSaleStatus) {
  if (status === "OPEN") return "30分钟前";
  if (status === "ASSIGNED") return "处理中";
  return "已完成";
}
