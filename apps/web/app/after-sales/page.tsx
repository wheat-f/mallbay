"use client";

import type { AfterSaleSummary } from "@mallbay/shared";
import type { CreateAfterSalePayload } from "../../src/lib/api";
import { App, Button, Card, Form, Input, Select, Table, Tag } from "antd";
import { EyeOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { afterSalesApi, orderApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel
} from "../../src/features/after-sales/display";
import { filterAfterSalesRows, type AfterSaleQuickFilters } from "../../src/features/after-sales/filter";

type CreateAfterSaleFormValues = CreateAfterSalePayload & {
  issuePhotoUrlsText?: string;
};

type AfterSaleOrderOption = {
  id: string;
  orderNo?: string | null;
  customer?: { name?: string | null; personalName?: string | null; companyName?: string | null } | null;
  vehicle?: { plateNo?: string | null } | null;
};

export default function AfterSalesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [createForm] = Form.useForm<CreateAfterSaleFormValues>();
  const [selectedAfterSaleId, setSelectedAfterSaleId] = useState<string>();
  const [draftFilters, setDraftFilters] = useState<AfterSaleQuickFilters>({});
  const [appliedFilters, setAppliedFilters] = useState<AfterSaleQuickFilters>({});

  const listQuery = useQuery({
    queryKey: ["after-sales", storeId],
    queryFn: () => afterSalesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const ordersQuery = useQuery({
    queryKey: ["after-sales", "orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const orderOptions = ((ordersQuery.data?.items ?? []) as AfterSaleOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? "未编号订单",
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const allAfterSaleRows = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const afterSaleRows = useMemo(
    () => filterAfterSalesRows(allAfterSaleRows, appliedFilters),
    [allAfterSaleRows, appliedFilters]
  );
  const activeSelectedAfterSaleId = selectedAfterSaleId ?? afterSaleRows[0]?.id;
  const selectedAfterSale = useMemo(
    () => afterSaleRows.find((item) => item.id === activeSelectedAfterSaleId) ?? afterSaleRows[0],
    [activeSelectedAfterSaleId, afterSaleRows]
  );
  const afterSaleSummary = {
    total: allAfterSaleRows.length,
    pending: allAfterSaleRows.filter((item) => item.status === "OPEN").length,
    assigned: allAfterSaleRows.filter((item) => item.status === "ASSIGNED").length,
    resolved: allAfterSaleRows.filter((item) => item.status === "RESOLVED").length
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["after-sales", storeId] });
  const updateDraftFilter = (key: keyof AfterSaleQuickFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [key]: value }));
  };
  const applyQuickFilters = () => {
    setAppliedFilters(normalizeAfterSaleFilters(draftFilters));
    setSelectedAfterSaleId(undefined);
  };
  const resetQuickFilters = () => {
    setDraftFilters({});
    setAppliedFilters({});
    setSelectedAfterSaleId(undefined);
  };
  const createMutation = useMutation({
    mutationFn: (values: CreateAfterSalePayload) => afterSalesApi.create(values),
    onSuccess: async (created) => {
      message.success("售后单已创建");
      createForm.resetFields();
      setSelectedAfterSaleId(created.id);
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  return (
    <div className="management-page">
      <StorePageHeader title="售后管理" description="售后申请、派单、责任判断和处罚记录" />

      <div className="management-kpi-grid">
        {[
          ["售后单", afterSaleSummary.total, "门店售后服务总量"],
          ["待处理", afterSaleSummary.pending, "等待客服或主管处理"],
          ["处理中", afterSaleSummary.assigned, "师傅处理中"],
          ["已完成", afterSaleSummary.resolved, "已归档售后记录"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </div>

      <Card className="after-sales-filter-card management-filter-card">
        <div className="after-sales-filter-grid">
          <div className="after-sales-query-panel after-sales-search-box">
            <span className="after-sales-filter-section-title">售后快速查询</span>
            <Input
              prefix={<SearchOutlined />}
              placeholder="质保单号 / 姓名 / 车牌号 / VIN / 客户电话"
              value={draftFilters.keyword}
              onChange={(event) => updateDraftFilter("keyword", event.target.value)}
              onPressEnter={applyQuickFilters}
            />
            <div className="after-sales-prototype-filters">
              <label>
                <span>客户姓名</span>
                <Input
                  placeholder="输入客户姓名"
                  value={draftFilters.customerName}
                  onChange={(event) => updateDraftFilter("customerName", event.target.value)}
                  onPressEnter={applyQuickFilters}
                />
              </label>
              <label>
                <span>车架号 (VIN)</span>
                <Input
                  placeholder="输入VIN"
                  value={draftFilters.vin}
                  onChange={(event) => updateDraftFilter("vin", event.target.value)}
                  onPressEnter={applyQuickFilters}
                />
              </label>
              <label>
                <span>客户电话</span>
                <Input
                  placeholder="输入手机号"
                  value={draftFilters.phone}
                  onChange={(event) => updateDraftFilter("phone", event.target.value)}
                  onPressEnter={applyQuickFilters}
                />
              </label>
              <label>
                <span>质保单号</span>
                <Input
                  placeholder="输入质保单号"
                  value={draftFilters.warrantyNo}
                  onChange={(event) => updateDraftFilter("warrantyNo", event.target.value)}
                  onPressEnter={applyQuickFilters}
                />
              </label>
              <div className="after-sales-prototype-filter-actions">
                <Button type="primary" icon={<SearchOutlined />} onClick={applyQuickFilters}>
                  查询
                </Button>
                <Button onClick={resetQuickFilters}>重置</Button>
              </div>
            </div>
          </div>
          <div className="after-sales-create-panel">
            <span className="after-sales-filter-section-title">登记售后问题</span>
            <Form
              form={createForm}
              layout="vertical"
              className="after-sales-create-form"
              onFinish={(values) => createMutation.mutate({
                orderId: values.orderId,
                description: values.description,
                issuePhotoUrls: parsePhotoUrls(values.issuePhotoUrlsText)
              })}
            >
              <Form.Item name="orderId" label="订单" rules={[{ required: true, message: "请选择订单" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={ordersQuery.isLoading}
                  placeholder="选择订单"
                  options={orderOptions}
                />
              </Form.Item>
              <Form.Item name="description" label="售后问题" rules={[{ required: true, message: "请输入售后问题" }]}>
                <Input placeholder="描述客户反馈、缺陷位置或补膜需求" />
              </Form.Item>
              <Form.Item name="issuePhotoUrlsText" label="问题照片">
                <Input.TextArea rows={2} placeholder="每行一个问题照片链接，支持施工前缺陷、车辆全景或细节图" />
              </Form.Item>
              <div className="after-sales-create-actions">
                <Button htmlType="submit" type="primary" icon={<PlusOutlined />} loading={createMutation.isPending}>
                  登记售后问题
                </Button>
              </div>
            </Form>
          </div>
        </div>
      </Card>

      <section className="after-sales-workspace">
        <Card className="after-sales-ticket-list" title="售后工单列表">
          <div className="after-sales-ticket-mobile-cards">
            {afterSaleRows.length > 0 ? (
              afterSaleRows.map((row) => (
                <article
                  key={row.id}
                  className={row.id === selectedAfterSale?.id ? "after-sales-ticket-mobile-card is-selected" : "after-sales-ticket-mobile-card"}
                  onClick={() => setSelectedAfterSaleId(row.id)}
                >
                  <div className="after-sales-ticket-mobile-head">
                    <div className="min-w-0">
                      <strong>{getAfterSaleBusinessLabel(row)}</strong>
                      <span>{getAfterSaleOrderLabel(row)}</span>
                    </div>
                    <Tag>{getAfterSaleStatusLabel(row.status)}</Tag>
                  </div>

                  <p className="after-sales-ticket-mobile-desc">{row.description || "售后问题待补充"}</p>

                  <dl className="after-sales-ticket-mobile-fields">
                    <div>
                      <dt>责任判定</dt>
                      <dd><Tag>{getAfterSaleResponsibilityLabel(row.responsibility)}</Tag></dd>
                    </div>
                    <div>
                      <dt>处理进度</dt>
                      <dd><AfterSaleProgress status={row.status} /></dd>
                    </div>
                  </dl>

                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/after-sales/${row.id}`);
                    }}
                  >
                    查看详情
                  </Button>
                </article>
              ))
            ) : (
              <div className="after-sales-ticket-mobile-empty">暂无售后工单</div>
            )}
          </div>
          <Table<AfterSaleSummary>
            className="after-sales-ticket-desktop-table"
            rowKey="id"
            loading={listQuery.isLoading}
            dataSource={afterSaleRows}
            pagination={{ pageSize: 6 }}
            onRow={(row) => ({
              onClick: () => setSelectedAfterSaleId(row.id)
            })}
            rowClassName={(row) => (row.id === selectedAfterSale?.id ? "after-sales-selected-row" : "")}
            columns={[
              { title: "售后单号", render: (_, row) => getAfterSaleBusinessLabel(row) },
              { title: "订单", render: (_, row) => getAfterSaleOrderLabel(row) },
              { title: "售后问题", dataIndex: "description", ellipsis: true },
              { title: "责任判定", render: (_, row) => <Tag>{getAfterSaleResponsibilityLabel(row.responsibility)}</Tag> },
              { title: "进度", render: (_, row) => <AfterSaleProgress status={row.status} /> },
              { title: "状态", render: (_, row) => <Tag>{getAfterSaleStatusLabel(row.status)}</Tag> },
              {
                title: "操作",
                render: (_, row) => (
                  <Button
                    type="link"
                    icon={<EyeOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      router.push(`/after-sales/${row.id}`);
                    }}
                  >
                    查看详情
                  </Button>
                )
              }
            ]}
          />
        </Card>

      </section>
    </div>
  );
}

function AfterSaleProgress({ status }: { status: string }) {
  const percentByStatus: Record<string, number> = {
    OPEN: 0,
    ASSIGNED: 60,
    RESOLVED: 100,
    CLOSED: 100,
    CANCELLED: 100
  };
  const percent = percentByStatus[status] ?? 0;
  return (
    <div className="after-sales-progress">
      <i>
        <b style={{ width: `${percent}%` }} />
      </i>
      <span>{percent}%</span>
    </div>
  );
}

function normalizeAfterSaleFilters(filters: AfterSaleQuickFilters): AfterSaleQuickFilters {
  return Object.fromEntries(
    Object.entries(filters)
      .map(([key, value]) => [key, value?.trim()])
      .filter(([, value]) => value)
  ) as AfterSaleQuickFilters;
}

function parsePhotoUrls(text?: string) {
  return [...new Set((text ?? "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
}
