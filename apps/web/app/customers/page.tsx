"use client";

import { App, Button, Card, Drawer, Empty, Form, Input, Select, Space, Table, Tag, Tooltip } from "antd";
import { EyeOutlined, FileTextOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { customerApi } from "../../src/lib/api";
import {
  toCreateCustomerPayload,
  type CreateCustomerFormValues
} from "../../src/features/customers/create-customer-form";
import { getCustomerAutoArchiveMetrics, type CustomerArchiveLike } from "../../src/features/customers/display";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";

type CustomerRow = CustomerArchiveLike & {
  id: string;
  customerType: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  wechat?: string | null;
  sourceType?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  phone?: string | null;
  vehicles?: { id: string; carPlate?: string | null; carModel?: string | null; carColor?: string | null }[];
  tags?: { id: string; label: string }[];
};

const quickSearchModes = [
  { label: "手机号", placeholder: "输入手机号进行搜索" },
  { label: "车牌号", placeholder: "输入车牌号进行搜索" },
  { label: "VIN", placeholder: "输入 VIN 进行搜索" },
  { label: "客户姓名", placeholder: "输入客户姓名进行搜索" },
  { label: "企业名称", placeholder: "输入企业名称进行搜索" },
  { label: "订单号", placeholder: "输入订单号进行搜索" }
];

export default function CustomersPage() {
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [search, setSearch] = useState("");
  const [quickSearchMode, setQuickSearchMode] = useState(quickSearchModes[0]?.label ?? "手机号");
  const [customerTypeFilter, setCustomerTypeFilter] = useState<string>();
  const [tagFilter, setTagFilter] = useState<string>();
  const [valueFilter, setValueFilter] = useState<string>();
  const [warrantyFilter, setWarrantyFilter] = useState<string>();
  const [recentFilter, setRecentFilter] = useState<string>();
  const [referrerKeyword, setReferrerKeyword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [createCustomerType, setCreateCustomerType] = useState("PERSONAL");
  const [createForm] = Form.useForm<CreateCustomerFormValues>();

  const customersQuery = useQuery({
    queryKey: ["customers", storeId, search],
    queryFn: () => customerApi.list({ storeId: storeId!, page: 1, pageSize: 20, q: search }),
    enabled: Boolean(storeId),
    staleTime: 10_000
  });

  const referrersQuery = useQuery({
    queryKey: ["customer-referrer-search", storeId, referrerKeyword],
    queryFn: () => customerApi.search(storeId!, referrerKeyword),
    enabled: Boolean(storeId) && referrerKeyword.length > 0
  });

  const rows = useMemo(() => (customersQuery.data?.items ?? []) as CustomerRow[], [customersQuery.data]);
  const filteredRows = useMemo(
    () =>
      rows.filter((row) => {
        const metrics = getCustomerAutoArchiveMetrics(row);
        const tags = getCustomerTags(row, metrics.systemTagLabels).map((tag) => tag.label);

        if (customerTypeFilter && row.customerType !== customerTypeFilter) return false;
        if (tagFilter && !tags.includes(tagFilter)) return false;
        if (valueFilter === "OVER_10000" && metrics.totalAmountCents < 1_000_000) return false;
        if (valueFilter === "OVER_50000" && metrics.totalAmountCents < 5_000_000) return false;
        if (warrantyFilter === "ACTIVE" && metrics.activeWarrantyCount <= 0) return false;
        if (warrantyFilter === "NONE" && metrics.activeWarrantyCount > 0) return false;
        if (recentFilter && !isWithinRecentDays(row.updatedAt ?? row.createdAt, Number(recentFilter))) return false;

        return true;
      }),
    [customerTypeFilter, recentFilter, rows, tagFilter, valueFilter, warrantyFilter]
  );
  const customerSummary = useMemo(() => {
    const vehicleCount = rows.reduce((sum, row) => sum + (row.vehicles?.length ?? 0), 0);
    const taggedCount = rows.filter((row) => getCustomerTags(row, getCustomerAutoArchiveMetrics(row).systemTagLabels).length > 0).length;
    return {
      total: customersQuery.data?.total ?? rows.length,
      vehicleCount,
      personalCount: rows.filter((row) => row.customerType !== "COMPANY").length,
      companyCount: rows.filter((row) => row.customerType === "COMPANY").length,
      taggedCount
    };
  }, [customersQuery.data?.total, rows]);
  const referrerOptions = ((referrersQuery.data ?? []) as CustomerRow[]).map((customer) => ({
    label: customer.companyName ?? customer.name ?? customer.contactPerson ?? customer.id,
    value: customer.id
  }));

  const createMutation = useMutation({
    mutationFn: (values: CreateCustomerFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      return customerApi.create(toCreateCustomerPayload(storeId, values));
    },
    onSuccess: () => {
      message.success("客户已创建");
      setCreateOpen(false);
      setCreateCustomerType("PERSONAL");
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["customers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const closeCreateDrawer = () => {
    if (createMutation.isPending) return;
    setCreateOpen(false);
    setCreateCustomerType("PERSONAL");
    createForm.resetFields();
  };

  return (
    <>
      <div className="management-page">
        <StorePageHeader title="客户管理" description="管理所有个人与企业客户信息及相关业务记录">
          <Button type="primary" icon={<PlusOutlined />} disabled={!storeId} onClick={() => setCreateOpen(true)}>
            新建客户
          </Button>
        </StorePageHeader>

        <div className="management-kpi-grid management-kpi-grid-five">
          {[
            ["客户总数", customerSummary.total, "当前门店客户档案"],
            ["车辆档案", customerSummary.vehicleCount, "可用于订单车辆选择"],
            ["个人客户", customerSummary.personalCount, "当前页个人档案"],
            ["企业客户", customerSummary.companyCount, "当前页企业档案"],
            ["已打标签", customerSummary.taggedCount, "含人工或系统客户标签"]
          ].map(([label, value, description]) => (
            <Card key={label} className="management-kpi-card">
              <div className="management-kpi-label">{label}</div>
              <div className="management-kpi-value">{value}</div>
              <div className="management-kpi-desc">{description}</div>
            </Card>
          ))}
        </div>

        <section className="customers-filter-card management-filter-card">
          <div className="customers-search-row">
            <span className="customers-filter-label">快速搜索</span>
            <div className="customers-search-chips">
              {quickSearchModes.map((mode) => (
                <button
                  key={mode.label}
                  type="button"
                  className={mode.label === quickSearchMode ? "customers-search-chip active" : "customers-search-chip"}
                  onClick={() => setQuickSearchMode(mode.label)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <Input.Search
              className="customers-search-input"
              prefix={<SearchOutlined />}
              placeholder={quickSearchModes.find((mode) => mode.label === quickSearchMode)?.placeholder}
              allowClear
              onSearch={setSearch}
            />
          </div>

          <div className="customers-filter-grid management-filter-grid">
            <div className="orders-filter-item">
              <span className="orders-filter-label">客户类型</span>
              <Select
                allowClear
                placeholder="全部"
                value={customerTypeFilter}
                onChange={(value) => setCustomerTypeFilter(value)}
                options={[
                  { label: "个人客户", value: "PERSONAL" },
                  { label: "企业客户", value: "COMPANY" }
                ]}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">客户标签</span>
              <Select
                allowClear
                placeholder="全部"
                value={tagFilter}
                onChange={(value) => setTagFilter(value)}
                options={[
                  { label: "VIP客户", value: "VIP客户" },
                  { label: "高价值客户", value: "高价值客户" },
                  { label: "老客户", value: "老客户" },
                  { label: "新客户", value: "新客户" }
                ]}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">消费价值</span>
              <Select
                allowClear
                placeholder="不限"
                value={valueFilter}
                onChange={(value) => setValueFilter(value)}
                options={[
                  { label: "¥10,000 以上", value: "OVER_10000" },
                  { label: "¥50,000 以上", value: "OVER_50000" }
                ]}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">质保状态</span>
              <Select
                allowClear
                placeholder="全部"
                value={warrantyFilter}
                onChange={(value) => setWarrantyFilter(value)}
                options={[
                  { label: "有有效质保", value: "ACTIVE" },
                  { label: "暂无有效质保", value: "NONE" }
                ]}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">最近消费时间</span>
              <Select
                allowClear
                placeholder="不限"
                value={recentFilter}
                onChange={(value) => setRecentFilter(value)}
                options={[
                  { label: "近 30 天", value: "30" },
                  { label: "近半年", value: "180" },
                  { label: "近一年", value: "365" }
                ]}
              />
            </div>
            <div className="orders-filter-item">
              <span className="orders-filter-label">筛选结果</span>
              <div className="customers-filter-result">{filteredRows.length} / {rows.length} 条</div>
            </div>
          </div>
        </section>

        {!storeId ? (
          <Empty description="当前账号尚未加入门店" />
        ) : (
          <Card className="management-table-card customers-table-card">
            <div className="customers-mobile-cards">
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => {
                  const metrics = getCustomerAutoArchiveMetrics(row);
                  const tags = getCustomerTags(row, metrics.systemTagLabels);

                  return (
                    <article key={row.id} className="customers-mobile-card" onClick={() => setSelectedCustomer(row)}>
                      <div className="customers-mobile-card-head">
                        <div className="customers-name-cell">
                          <div className="customers-avatar">{getCustomerInitial(row)}</div>
                          <div className="min-w-0">
                            <div className="customers-name">{getCustomerName(row)}</div>
                            <div className="customers-contact">{getCustomerContactSummary(row)}</div>
                          </div>
                        </div>
                        <Tag>{getCustomerTypeLabel(row.customerType)}</Tag>
                      </div>

                      <dl className="customers-mobile-fields">
                        <div>
                          <dt>车辆</dt>
                          <dd>{getVehicleSummary(row)}</dd>
                        </div>
                        <div>
                          <dt>消费总额</dt>
                          <dd>{metrics.orderCount > 0 ? <strong>{formatCurrency(metrics.totalAmountCents)}</strong> : "暂无记录"}</dd>
                        </div>
                        <div>
                          <dt>最近消费</dt>
                          <dd>{formatCustomerDate(row.updatedAt ?? row.createdAt)}</dd>
                        </div>
                        <div>
                          <dt>有效质保</dt>
                          <dd>{metrics.activeWarrantyCount > 0 ? <Tag color="success">{metrics.activeWarrantyCount} 份</Tag> : <Tag>待生成</Tag>}</dd>
                        </div>
                        <div>
                          <dt>客户标签</dt>
                          <dd>
                            {tags.length > 0 ? (
                              <span className="customers-tag-list">
                                {tags.map((tag) => (
                                  <Tag key={tag.label} color={tag.color}>
                                    {tag.label}
                                  </Tag>
                                ))}
                              </span>
                            ) : (
                              "未打标签"
                            )}
                          </dd>
                        </div>
                      </dl>

                      <div className="customers-mobile-actions">
                        <Button
                          size="small"
                          icon={<EyeOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCustomer(row);
                          }}
                        >
                          档案
                        </Button>
                        <Button
                          size="small"
                          icon={<FileTextOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/orders/create?customerId=${row.id}`);
                          }}
                        >
                          新建订单
                        </Button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="customers-mobile-empty">暂无客户数据</div>
              )}
            </div>
            <Table<CustomerRow>
              className="customers-desktop-table"
              rowKey="id"
              loading={customersQuery.isLoading}
              dataSource={filteredRows}
              scroll={{ x: 1080 }}
              onRow={(row) => ({
                className: "customers-clickable-row",
                onClick: () => setSelectedCustomer(row)
              })}
              columns={[
                {
                  title: "客户姓名/企业名称",
                  width: 220,
                  render: (_, row) => (
                    <div className="customers-name-cell">
                      <div className="customers-avatar">{getCustomerInitial(row)}</div>
                      <div className="min-w-0">
                        <div className="customers-name">{getCustomerName(row)}</div>
                        <div className="customers-contact">{getCustomerContactSummary(row)}</div>
                      </div>
                    </div>
                  )
                },
                {
                  title: "客户类型",
                  width: 90,
                  render: (_, row) => <Tag>{getCustomerTypeLabel(row.customerType)}</Tag>
                },
                {
                  title: "车辆数量",
                  width: 82,
                  align: "right",
                  render: (_, row) => row.vehicles?.length ?? 0
                },
                {
                  title: "车辆",
                  width: 190,
                  render: (_, row) => <span className="customers-muted">{getVehicleSummary(row)}</span>
                },
                {
                  title: "消费总额",
                  width: 100,
                  align: "right",
                  render: (_, row) => {
                    const metrics = getCustomerAutoArchiveMetrics(row);
                    return metrics.orderCount > 0 ? (
                      <strong>{formatCurrency(metrics.totalAmountCents)}</strong>
                    ) : (
                      <span className="customers-muted">暂无记录</span>
                    );
                  }
                },
                {
                  title: "最近消费",
                  width: 100,
                  render: (_, row) => <span className="customers-muted">{formatCustomerDate(row.updatedAt ?? row.createdAt)}</span>
                },
                {
                  title: "有效质保",
                  width: 100,
                  render: (_, row) => {
                    const metrics = getCustomerAutoArchiveMetrics(row);
                    return metrics.activeWarrantyCount > 0 ? (
                      <Tag color="success">{metrics.activeWarrantyCount} 份</Tag>
                    ) : (
                      <Tag>待生成</Tag>
                    );
                  }
                },
                {
                  title: "客户标签",
                  width: 120,
                  render: (_, row) => {
                    const tags = getCustomerTags(row, getCustomerAutoArchiveMetrics(row).systemTagLabels);
                    return tags.length > 0 ? (
                      <div className="customers-tag-list">
                        {tags.map((tag) => (
                          <Tag key={tag.label} color={tag.color}>
                            {tag.label}
                          </Tag>
                        ))}
                      </div>
                    ) : (
                      <span className="customers-muted">未打标签</span>
                    );
                  }
                },
                {
                  title: "操作",
                  width: 80,
                  align: "center",
                  render: (_, row) => (
                    <Space size={4}>
                      <Tooltip title="查看档案">
                        <Button
                          aria-label="查看档案"
                          type="text"
                          icon={<EyeOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedCustomer(row);
                          }}
                        />
                      </Tooltip>
                      <Tooltip title="新建订单">
                        <Button
                          aria-label="新建订单"
                          type="text"
                          icon={<FileTextOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/orders/create?customerId=${row.id}`);
                          }}
                        />
                      </Tooltip>
                    </Space>
                  )
                }
              ]}
            />
          </Card>
        )}
        </div>

        <Drawer
          className="customers-detail-drawer"
          title="客户详情"
          open={Boolean(selectedCustomer)}
          onClose={() => setSelectedCustomer(null)}
          destroyOnHidden
          footer={
            selectedCustomer ? (
              <div className="customers-drawer-footer">
                <Button onClick={() => router.push(`/customers/${selectedCustomer.id}`)}>
                  查看完整历史
                </Button>
                <Button type="primary" icon={<FileTextOutlined />} onClick={() => router.push(`/orders/create?customerId=${selectedCustomer.id}`)}>
                  新建订单
                </Button>
              </div>
            ) : null
          }
        >
          {selectedCustomer ? <CustomerDetailDrawer customer={selectedCustomer} /> : null}
        </Drawer>

        <Drawer
          className="customers-create-drawer"
          open={createOpen}
          title="新建客户"
          onClose={closeCreateDrawer}
          destroyOnHidden
          footer={
            <div className="customers-create-drawer-footer">
              <Button onClick={closeCreateDrawer}>取消</Button>
              <Button type="primary" loading={createMutation.isPending} onClick={() => createForm.submit()}>
                创建客户
              </Button>
            </div>
          }
        >
          <Form<CreateCustomerFormValues>
            form={createForm}
            layout="vertical"
            className="customers-create-form"
            initialValues={{ customerType: "PERSONAL", sourceType: "OFFLINE_STORE" }}
            onValuesChange={(changedValues) => {
              if ("customerType" in changedValues) {
                setCreateCustomerType(changedValues.customerType ?? "PERSONAL");
              }
            }}
            onFinish={(values) => createMutation.mutate(values)}
          >
            <Form.Item name="customerType" label="客户类型" rules={[{ required: true, message: "请选择客户类型" }]}>
              <Select
                options={[
                  { label: "个人客户", value: "PERSONAL" },
                  { label: "企业客户", value: "COMPANY" }
                ]}
              />
            </Form.Item>

            {createCustomerType === "COMPANY" ? (
              <>
                <Form.Item
                  name="companyName"
                  label="企业名称"
                  rules={[{ required: true, whitespace: true, message: "请输入企业名称" }]}
                >
                  <Input maxLength={100} />
                </Form.Item>
                <Form.Item
                  name="contactPerson"
                  label="联系人"
                  rules={[{ required: true, whitespace: true, message: "请输入联系人" }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
              </>
            ) : (
              <>
                <Form.Item
                  name="name"
                  label="客户姓名"
                  rules={[{ required: true, whitespace: true, message: "请输入客户姓名" }]}
                >
                  <Input maxLength={50} />
                </Form.Item>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Form.Item name="gender" label="性别">
                    <Select
                      allowClear
                      options={[
                        { label: "男", value: "MALE" },
                        { label: "女", value: "FEMALE" },
                        { label: "未知", value: "UNKNOWN" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="birthday" label="生日">
                    <BirthdaySelector />
                  </Form.Item>
                </div>
              </>
            )}

            <Form.Item
              name="phone"
              label="手机号"
              rules={[
                { required: true, message: "请输入手机号" },
                { pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }
              ]}
            >
              <Input maxLength={11} />
            </Form.Item>

            <Form.Item name="wechat" label="微信号">
              <Input maxLength={50} />
            </Form.Item>

            <Form.Item name="sourceType" label="客户来源">
              <Select
                allowClear
                options={[
                  { label: "到店", value: "OFFLINE_STORE" },
                  { label: "抖音", value: "ONLINE_DOUYIN" },
                  { label: "小红书", value: "ONLINE_XIAOHONGSHU" },
                  { label: "快手", value: "ONLINE_KUAISHOU" },
                  { label: "转介绍", value: "REFERRAL" },
                  { label: "合作方", value: "PARTNER" },
                  { label: "其他", value: "OTHER" }
                ]}
              />
            </Form.Item>

            <Form.Item name="sourceDetail" label="来源说明">
              <Input maxLength={100} />
            </Form.Item>

            <Form.Item name="referrerId" label="介绍人">
              <Select
                allowClear
                showSearch
                filterOption={false}
                onSearch={setReferrerKeyword}
                options={referrerOptions}
                placeholder="可搜索老客户作为介绍人"
              />
            </Form.Item>
          </Form>
        </Drawer>
    </>
  );
}

function CustomerDetailDrawer({ customer }: { customer: CustomerRow }) {
  const metrics = getCustomerAutoArchiveMetrics(customer);
  const tags = getCustomerTags(customer, metrics.systemTagLabels);
  const vehicles = customer.vehicles ?? [];

  return (
    <div className="customers-drawer-body">
      <section className="customers-drawer-summary-card">
        <div className="customers-drawer-heading">
          <div className="customers-drawer-avatar">{getCustomerInitial(customer)}</div>
          <div className="min-w-0">
            <h3>{getCustomerName(customer)}</h3>
            <div className="customers-drawer-tags">
              {tags.length > 0 ? tags.map((tag) => <Tag key={tag.label} color={tag.color}>{tag.label}</Tag>) : <Tag>未打标签</Tag>}
            </div>
          </div>
        </div>
        <div className="customers-drawer-facts">
          <div>
            <span>电话</span>
            <strong>{customer.phone ?? "联系方式已加密"}</strong>
          </div>
          <div>
            <span>微信</span>
            <strong>{customer.wechat ?? "未维护"}</strong>
          </div>
          <div>
            <span>客户类型</span>
            <strong>{getCustomerTypeLabel(customer.customerType)}</strong>
          </div>
          <div>
            <span>来源</span>
            <strong>{customer.sourceType ? getSourceTypeLabel(customer.sourceType) : "未维护"}</strong>
          </div>
        </div>
      </section>

      <section className="customers-drawer-section">
        <div className="customers-drawer-section-title">
          <h4>消费概览</h4>
          <span>由订单、质保和售后记录自动汇总</span>
        </div>
        <div className="customers-drawer-metrics">
          <div>
            <span>消费次数</span>
            <strong>{metrics.orderCount}</strong>
          </div>
          <div>
            <span>消费总额</span>
            <strong>{formatCurrency(metrics.totalAmountCents)}</strong>
          </div>
          <div>
            <span>有效质保</span>
            <strong>{metrics.activeWarrantyCount}</strong>
          </div>
        </div>
      </section>

      <section className="customers-drawer-section">
        <div className="customers-drawer-section-title">
          <h4>名下车辆 ({vehicles.length})</h4>
          <span>用于销售开单和施工履约</span>
        </div>
        {vehicles.length > 0 ? (
          <div className="customers-drawer-vehicle-list">
            {vehicles.map((vehicle) => (
              <article key={vehicle.id} className="customers-drawer-vehicle">
                <div className="customers-drawer-vehicle-thumb">车</div>
                <div className="min-w-0">
                  <strong>{vehicle.carPlate ?? "未录车牌"}</strong>
                  <span>{[vehicle.carModel, vehicle.carColor].filter(Boolean).join(" / ") || "车辆信息待完善"}</span>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无车辆档案" />
        )}
      </section>

      <section className="customers-drawer-section">
        <div className="customers-drawer-section-title">
          <h4>最近动态</h4>
          <span>优先展示系统可自动生成的信息</span>
        </div>
        <div className="customers-drawer-timeline">
          <div>
            <strong>档案更新时间</strong>
            <span>{formatCustomerDate(customer.updatedAt ?? customer.createdAt)}</span>
          </div>
          <div>
            <strong>质保状态</strong>
            <span>{metrics.activeWarrantyCount > 0 ? `${metrics.activeWarrantyCount} 份有效质保` : "暂无有效质保"}</span>
          </div>
          <div>
            <strong>售后风险</strong>
            <span>{metrics.openAfterSaleCount > 0 ? `${metrics.openAfterSaleCount} 条售后记录需关注` : "暂无售后风险"}</span>
          </div>
        </div>
      </section>
    </div>
  );
}

function getCustomerName(row: CustomerRow) {
  return row.customerType === "COMPANY"
    ? row.companyName ?? row.contactPerson ?? "未命名企业"
    : row.name ?? row.contactPerson ?? "未命名客户";
}

function getCustomerInitial(row: CustomerRow) {
  const name = getCustomerName(row).trim();
  return name.slice(0, 1).toUpperCase() || "客";
}

function getCustomerContactSummary(row: CustomerRow) {
  if (row.contactPerson && row.customerType === "COMPANY") return `联系人：${row.contactPerson}`;
  if (row.wechat) return `微信：${row.wechat}`;
  if (row.sourceType) return getSourceTypeLabel(row.sourceType);
  return "联系方式已加密";
}

function getCustomerTypeLabel(customerType: string) {
  return customerType === "COMPANY" ? "企业" : "个人";
}

function getVehicleSummary(row: CustomerRow) {
  const vehicle = row.vehicles?.[0];
  if (!vehicle) return "暂无车辆";
  return [vehicle.carPlate, vehicle.carModel, vehicle.carColor].filter(Boolean).join(" / ") || "车辆信息待完善";
}

function getCustomerTags(row: CustomerRow, systemTagLabels: string[]) {
  const labels = new Set<string>();
  for (const tag of row.tags ?? []) {
    if (tag.label) labels.add(tag.label);
  }
  for (const label of systemTagLabels) labels.add(label.replace(/\s+/g, ""));
  if ((row.vehicles?.length ?? 0) > 1) labels.add("老客户");
  if (row.customerType === "COMPANY") labels.add("高价值客户");
  if (isWithinRecentDays(row.createdAt, 30)) labels.add("新客户");

  return Array.from(labels).slice(0, 3).map((label) => ({
    label,
    color: getTagColor(label)
  }));
}

function getTagColor(label: string) {
  if (label.includes("VIP")) return "gold";
  if (label.includes("高价值")) return "blue";
  if (label.includes("新客户")) return "green";
  if (label.includes("重点") || label.includes("问题")) return "red";
  return "default";
}

function getSourceTypeLabel(sourceType: string) {
  const labels: Record<string, string> = {
    OFFLINE_STORE: "到店客户",
    ONLINE_DOUYIN: "抖音线索",
    ONLINE_XIAOHONGSHU: "小红书线索",
    ONLINE_KUAISHOU: "快手线索",
    REFERRAL: "转介绍",
    PARTNER: "合作方",
    OTHER: "其他来源"
  };
  return labels[sourceType] ?? "客户来源待确认";
}

function formatCurrency(value?: number | null) {
  return `¥${((value ?? 0) / 100).toFixed(2)}`;
}

function formatCustomerDate(value?: string | null) {
  if (!value) return "暂无记录";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无记录";
  return date.toISOString().slice(0, 10);
}

function isWithinRecentDays(value: string | null | undefined, days: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const diffMs = Date.now() - date.getTime();
  return diffMs >= 0 && diffMs <= days * 24 * 60 * 60 * 1000;
}

type BirthdaySelectorProps = {
  value?: string;
  onChange?: (value?: string) => void;
};

type BirthdayParts = {
  year?: number;
  month?: number;
  day?: number;
};

function BirthdaySelector({ value, onChange }: BirthdaySelectorProps) {
  const [draft, setDraft] = useState<{ baseValue?: string; parts: BirthdayParts }>(() => ({
    baseValue: value,
    parts: parseBirthday(value)
  }));
  const parsedValueParts = useMemo(() => parseBirthday(value), [value]);
  const parts = draft.baseValue === value ? draft.parts : parsedValueParts;
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 101 }, (_, index) => {
      const year = currentYear - index;
      return { label: `${year} 年`, value: year };
    });
  }, []);
  const monthOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => ({ label: `${index + 1} 月`, value: index + 1 })),
    []
  );
  const dayOptions = useMemo(() => {
    const maxDay = getDaysInMonth(parts.year, parts.month);
    return Array.from({ length: maxDay }, (_, index) => ({ label: `${index + 1} 日`, value: index + 1 }));
  }, [parts.month, parts.year]);

  const updatePart = (key: keyof BirthdayParts, nextValue?: number) => {
    const nextParts = { ...parts, [key]: nextValue };
    const maxDay = getDaysInMonth(nextParts.year, nextParts.month);
    if (nextParts.day && nextParts.day > maxDay) {
      nextParts.day = maxDay;
    }
    setDraft({ baseValue: value, parts: nextParts });

    if (nextParts.year && nextParts.month && nextParts.day) {
      onChange?.(formatBirthday(nextParts.year, nextParts.month, nextParts.day));
      return;
    }

    if (value) {
      onChange?.(undefined);
    }
  };

  return (
    <Space.Compact className="w-full">
      <Select
        allowClear
        className="!w-[42%]"
        options={yearOptions}
        placeholder="年份"
        value={parts.year}
        onChange={(nextValue) => updatePart("year", nextValue)}
      />
      <Select
        allowClear
        className="!w-[29%]"
        options={monthOptions}
        placeholder="月份"
        value={parts.month}
        onChange={(nextValue) => updatePart("month", nextValue)}
      />
      <Select
        allowClear
        className="!w-[29%]"
        options={dayOptions}
        placeholder="日期"
        value={parts.day}
        onChange={(nextValue) => updatePart("day", nextValue)}
      />
    </Space.Compact>
  );
}

function parseBirthday(value?: string): BirthdayParts {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return {};
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
}

function getDaysInMonth(year?: number, month?: number) {
  if (!year || !month) return 31;
  return new Date(year, month, 0).getDate();
}

function formatBirthday(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
