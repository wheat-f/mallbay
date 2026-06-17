"use client";

import type { WarrantySummary } from "@mallbay/shared";
import type { CreateWarrantyPayload } from "../../src/lib/api";
import { App, Button, Card, Form, Input, Select, Table, Tag } from "antd";
import {
  DownloadOutlined,
  FileProtectOutlined,
  FilterOutlined,
  IdcardOutlined,
  PrinterOutlined,
  SearchOutlined,
  SafetyCertificateOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { orderApi, warrantiesApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import {
  getWarrantyCardRows,
  getWarrantyExpiryReminder,
  getWarrantyOrderLabel,
  getWarrantyStatusLabel
} from "../../src/features/warranties/display";

export default function WarrantiesPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [form] = Form.useForm<CreateWarrantyPayload>();
  const [warrantyNo, setWarrantyNo] = useState("");
  const [summaryNow] = useState(() => Date.now());

  type CompletedOrderOption = {
    id: string;
    orderNo?: string | null;
    customer?: { personalName?: string | null; companyName?: string | null; name?: string | null } | null;
    vehicle?: { plateNo?: string | null } | null;
  };

  const warrantiesQuery = useQuery({
    queryKey: ["warranties", storeId],
    queryFn: () => warrantiesApi.list(storeId!),
    enabled: Boolean(storeId)
  });
  const lookupQuery = useQuery({
    queryKey: ["warranty-lookup", warrantyNo],
    queryFn: () => warrantiesApi.lookup(warrantyNo),
    enabled: Boolean(warrantyNo)
  });
  const completedOrdersQuery = useQuery({
    queryKey: ["warranties", "completed-orders", storeId],
    queryFn: () => orderApi.list({ storeId: storeId!, status: "COMPLETED", page: 1, pageSize: 100 }),
    enabled: Boolean(storeId)
  });
  const completedOrderOptions = ((completedOrdersQuery.data?.items ?? []) as CompletedOrderOption[]).map((order) => ({
    value: order.id,
    label: [
      order.orderNo ?? "未编号订单",
      order.customer?.companyName ?? order.customer?.personalName ?? order.customer?.name,
      order.vehicle?.plateNo
    ].filter(Boolean).join(" / ")
  }));
  const warrantyRows = useMemo(() => (warrantiesQuery.data ?? []) as WarrantySummary[], [warrantiesQuery.data]);
  const warrantySummary = useMemo(() => {
    const expiringSoon = warrantyRows.filter((row) => {
      if (!row.endDate) return false;
      const days = (new Date(row.endDate).getTime() - summaryNow) / 86_400_000;
      return days >= 0 && days <= 30;
    }).length;
    return {
      total: warrantyRows.length,
      active: warrantyRows.filter((row) => row.status === "ACTIVE").length,
      expiringSoon,
      completedOrders: completedOrderOptions.length
    };
  }, [completedOrderOptions.length, summaryNow, warrantyRows]);

  const createWarranty = useMutation({
    mutationFn: (values: CreateWarrantyPayload) => warrantiesApi.createFromOrder(values),
    onSuccess: async () => {
      message.success("质保记录已生成");
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["warranties", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const lookupRows = lookupQuery.data ? getWarrantyCardRows(lookupQuery.data) : [];

  return (
    <div className="management-page">
      <StorePageHeader title="质保登记台" description="电子质保登记、客户查询、到期提醒和售后追溯" />

      <section className="warranty-command-bar">
        <div className="warranty-command-copy">
          <span>质保编号查询</span>
          <strong>核验客户质保状态，快速进入售后追溯</strong>
        </div>
        <Input.Search
          prefix={<SearchOutlined />}
          placeholder="输入质保编号、车牌或客户姓名"
          allowClear
          enterButton="查询"
          onSearch={setWarrantyNo}
        />
        <div className="warranty-command-actions">
          <Button icon={<PrinterOutlined />}>批量打印</Button>
          <Button icon={<DownloadOutlined />}>导出记录</Button>
          <Button type="primary" icon={<FileProtectOutlined />} onClick={() => form.submit()}>
            生成电子质保
          </Button>
        </div>
      </section>

      <div className="management-kpi-grid">
        {[
          ["质保记录", warrantySummary.total, "全部电子质保"],
          ["有效质保", warrantySummary.active, "可用于售后追溯"],
          ["即将到期", warrantySummary.expiringSoon, "30 天内需关注"],
          ["待登记订单", warrantySummary.completedOrders, "已完工可生成"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </div>

      <section className="warranty-filter-panel">
        <div className="warranty-filter-search">
          <span>快速搜索</span>
          <Input.Search
            prefix={<SearchOutlined />}
            placeholder="质保编号 / 客户 / 车牌 / VIN"
            allowClear
            onSearch={setWarrantyNo}
          />
        </div>
        <div className="warranty-filter-field">
          <span>质保状态</span>
          <Select
            placeholder="全部状态"
            allowClear
            options={[
              { value: "ACTIVE", label: "生效中" },
              { value: "EXPIRED", label: "已过期" },
              { value: "VOIDED", label: "已作废" }
            ]}
          />
        </div>
        <div className="warranty-filter-field">
          <span>提醒范围</span>
          <Select
            placeholder="全部提醒"
            allowClear
            options={[
              { value: "EXPIRING", label: "30 天内到期" },
              { value: "OVERDUE", label: "已逾期" },
              { value: "NORMAL", label: "正常" }
            ]}
          />
        </div>
        <Button type="primary" icon={<SearchOutlined />}>
          查询
        </Button>
        <Button icon={<FilterOutlined />}>高级筛选</Button>
      </section>

      <section className="warranty-workspace">
        <div className="warranty-main-column">
          <Card
            className="warranty-record-list"
            title="已完工待质保订单"
            extra={
              <div className="warranty-table-actions">
                <Button size="small" icon={<DownloadOutlined />}>导出</Button>
                <Button size="small" icon={<PrinterOutlined />}>打印</Button>
              </div>
            }
          >
            <div className="warranty-mobile-cards">
              {warrantyRows.length > 0 ? (
                warrantyRows.map((row) => {
                  const reminder = getWarrantyExpiryReminder(row);

                  return (
                    <article key={row.id} className="warranty-mobile-card">
                      <div className="warranty-mobile-card-head">
                        <div className="min-w-0">
                          <strong>{row.warrantyNo}</strong>
                          <span>{getWarrantyOrderLabel(row)}</span>
                        </div>
                        <Tag>{getWarrantyStatusLabel(row.status)}</Tag>
                      </div>

                      <dl className="warranty-mobile-fields">
                        <div>
                          <dt>质保范围</dt>
                          <dd>{row.scope ?? "-"}</dd>
                        </div>
                        <div>
                          <dt>到期提醒</dt>
                          <dd><Tag color={reminder.color}>{reminder.label}</Tag></dd>
                        </div>
                        <div>
                          <dt>开始日期</dt>
                          <dd>{formatWarrantyDate(row.startDate)}</dd>
                        </div>
                        <div>
                          <dt>结束日期</dt>
                          <dd>{formatWarrantyDate(row.endDate)}</dd>
                        </div>
                      </dl>

                      <Button size="small" block onClick={() => router.push(`/warranties/${row.id}`)}>
                        查看详情
                      </Button>
                    </article>
                  );
                })
              ) : (
                <div className="warranty-mobile-empty">暂无质保记录</div>
              )}
            </div>
            <Table<WarrantySummary>
              className="warranty-desktop-table"
              rowKey="id"
              loading={warrantiesQuery.isLoading}
              dataSource={warrantyRows}
              scroll={{ x: 980 }}
              columns={[
                { title: "质保编号", dataIndex: "warrantyNo", width: 150 },
                { title: "订单 / 客户 / 车辆", width: 260, render: (_, row) => getWarrantyOrderLabel(row) },
                { title: "质保范围", dataIndex: "scope", width: 180 },
                { title: "状态", width: 100, render: (_, row) => <Tag>{getWarrantyStatusLabel(row.status)}</Tag> },
                {
                  title: "到期提醒",
                  width: 110,
                  render: (_, row) => {
                    const reminder = getWarrantyExpiryReminder(row);
                    return <Tag color={reminder.color}>{reminder.label}</Tag>;
                  }
                },
                { title: "开始", width: 110, render: (_, row) => formatWarrantyDate(row.startDate) },
                { title: "结束", width: 110, render: (_, row) => formatWarrantyDate(row.endDate) },
                {
                  title: "操作",
                  width: 90,
                  render: (_, row) => (
                    <Button size="small" onClick={() => router.push(`/warranties/${row.id}`)}>
                      详情
                    </Button>
                  )
                }
              ]}
            />
          </Card>

          <div className="warranty-guide-grid">
            <article className="warranty-launch-card">
              <span><SafetyCertificateOutlined /></span>
              <div>
                <h3>电子质保卡上线</h3>
                <p>质保生成后同步沉淀订单、客户、车辆和施工范围，后续售后可直接按质保编号追溯。</p>
              </div>
            </article>
            <article className="warranty-audit-guide">
              <span><IdcardOutlined /></span>
              <div>
                <h3>质保审核指南</h3>
                <p>登记前确认订单已完工、客户车辆信息完整、质保范围清晰，避免后续售后责任边界不清。</p>
              </div>
            </article>
          </div>
        </div>

        <aside className="warranty-side-column warranty-support-grid">
          <Card className="warranty-registration-panel" title="质保登记信息提取">
            <div className="warranty-panel-intro">
              <span>登记台</span>
              <strong>从已完工订单生成电子质保</strong>
              <p>选择订单后，系统复用订单客户、车辆、施工和产品信息，人工只维护质保范围与起始时间。</p>
            </div>
            <Form form={form} layout="vertical" onFinish={(values) => createWarranty.mutate(values)}>
              <Form.Item name="orderId" label="已完工订单" rules={[{ required: true, message: "请选择已完工订单" }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={completedOrdersQuery.isLoading}
                  placeholder="选择已完工订单"
                  options={completedOrderOptions}
                />
              </Form.Item>
              <div className="warranty-parameter-card">
                <div className="warranty-parameter-card-title">系统自动提取信息 (来自工单)</div>
                <div className="warranty-parameter-grid">
                  <label>
                    <span>客户姓名</span>
                    <Input value="选择订单后自动带入" disabled />
                  </label>
                  <label>
                    <span>联系电话</span>
                    <Input value="选择订单后自动带入" disabled />
                  </label>
                  <label>
                    <span>车牌号</span>
                    <Input value="选择订单后自动带入" disabled />
                  </label>
                  <label>
                    <span>车架号 VIN</span>
                    <Input value="选择订单后自动带入" disabled />
                  </label>
                </div>
              </div>
              <div className="warranty-proof-grid">
                {[
                  ["膜桶标签照片 (自动归档)", "扫码核验膜卷批次、序列号和施工记录"],
                  ["完工车辆照片 (自动归档)", "留存完工交付影像，售后追溯时可直接调阅"]
                ].map(([label, description]) => (
                  <div key={label} className="warranty-proof-card">
                    <div className="warranty-proof-thumb">
                      <FileProtectOutlined />
                    </div>
                    <strong>{label}</strong>
                    <span>{description}</span>
                  </div>
                ))}
              </div>
              <div className="warranty-parameter-card">
                <div className="warranty-parameter-card-title">质保参数配置</div>
                <div className="warranty-parameter-grid">
                  <label>
                    <span>质保编号 (系统生成)</span>
                    <Input value="提交后自动生成" disabled />
                  </label>
                  <label>
                    <span>产品型号 (自动匹配)</span>
                    <Input value="依据订单产品自动匹配" disabled />
                  </label>
                  <label>
                    <span>质保年限</span>
                    <Select
                      value="5 年"
                      disabled
                      options={[{ value: "5 年", label: "5 年" }]}
                    />
                  </label>
                  <label>
                    <span>质保到期日期 (自动计算)</span>
                    <Input value="按起始日期自动计算" disabled />
                  </label>
                </div>
              </div>
              <Form.Item name="scope" label="质保范围 (依据厂家标准)" rules={[{ required: true, message: "请输入质保范围" }]}>
                <Input placeholder="黄变 / 开裂 / 脱胶 / 起泡" />
              </Form.Item>
              <Form.Item name="startDate" label="起始日期">
                <Input placeholder="默认使用施工完工日期" />
              </Form.Item>
              <Button type="primary" htmlType="submit" block icon={<FileProtectOutlined />} loading={createWarranty.isPending}>
                提交生成质保
              </Button>
            </Form>
          </Card>

          <Card className="warranty-preview-panel" title="电子质保卡预览">
            <div className="warranty-card-preview">
              <div className="warranty-card-topline">
                <span>mallbay</span>
                <SafetyCertificateOutlined />
              </div>
              <strong>{lookupQuery.data?.warrantyNo ?? "输入编号后预览"}</strong>
              <p>{lookupQuery.data ? getWarrantyOrderLabel(lookupQuery.data) : "生成或查询后显示客户、车辆和施工范围"}</p>
              <Tag color={lookupQuery.data?.status === "ACTIVE" ? "success" : "default"}>
                {lookupQuery.data ? getWarrantyStatusLabel(lookupQuery.data.status) : "待查询"}
              </Tag>
            </div>
            <div className="warranty-preview-meta">
              {(lookupRows.length > 0
                ? lookupRows
                : [
                    { label: "质保编号", value: "-" },
                    { label: "质保范围", value: "-" },
                    { label: "开始日期", value: "-" },
                    { label: "到期日期", value: "-" }
                  ]
              ).map((row) => (
                <div key={row.label}>
                  <span>{row.label}</span>
                  <strong>{row.value}</strong>
                </div>
              ))}
            </div>
            <Button icon={<DownloadOutlined />} block>
              下载电子质保卡
            </Button>
          </Card>
        </aside>
      </section>
    </div>
  );
}

function formatWarrantyDate(value?: string | null) {
  if (!value) return "-";
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? "质保日期待确认";
}
