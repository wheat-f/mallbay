"use client";

import { App, Button, Card, Drawer, Empty, Form, Input, Select, Space, Table, Tag, Tooltip, Upload } from "antd";
import {
  CarOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { UploadProps } from "antd";
import { customerApi } from "../../src/lib/api";
import {
  toCreateCustomerPayload,
  toCreateVehiclePayloads,
  type CreateCustomerFormValues
} from "../../src/features/customers/create-customer-form";
import type { UpdateVehiclePayload } from "../../src/features/customers/api";
import { getCustomerAutoArchiveMetrics, type CustomerArchiveLike } from "../../src/features/customers/display";
import { useAuthStore } from "../../src/stores/auth-store";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";

type CustomerRow = CustomerArchiveLike & {
  id: string;
  customerType: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  gender?: string | null;
  birthday?: string | null;
  wechat?: string | null;
  sourceType?: string | null;
  sourceDetail?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  phone?: string | null;
  vehicles?: CustomerVehicle[];
  users?: CustomerUser[];
  tags?: { id: string; label: string }[];
};

type CustomerUser = {
  id: string;
  name?: string | null;
  phone?: string | null;
  note?: string | null;
};

type CustomerVehicle = {
  id: string;
  carPlate?: string | null;
  vin?: string | null;
  carModel?: string | null;
  carColor?: string | null;
  photoUrl?: string | null;
};

type EditCustomerFormValues = {
  customerType: "PERSONAL" | "COMPANY";
  name?: string;
  gender?: CreateCustomerFormValues["gender"];
  birthday?: string;
  companyName?: string;
  contactPerson?: string;
  phone?: string;
  wechat?: string;
  sourceType?: CreateCustomerFormValues["sourceType"];
  sourceDetail?: string;
};

type VehicleFormValues = UpdateVehiclePayload;
type UploadRequestOption = Parameters<NonNullable<UploadProps["customRequest"]>>[0];

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
  const [editCustomer, setEditCustomer] = useState<CustomerRow | null>(null);
  const [vehicleCustomer, setVehicleCustomer] = useState<CustomerRow | null>(null);
  const [editingVehicle, setEditingVehicle] = useState<CustomerVehicle | null>(null);
  const [vehiclePhotoUploading, setVehiclePhotoUploading] = useState(false);
  const [createVehiclePhotoUploading, setCreateVehiclePhotoUploading] = useState(false);
  const [createCustomerType, setCreateCustomerType] = useState("PERSONAL");
  const [editCustomerType, setEditCustomerType] = useState("PERSONAL");
  const [createForm] = Form.useForm<CreateCustomerFormValues>();
  const [editForm] = Form.useForm<EditCustomerFormValues>();
  const [vehicleForm] = Form.useForm<VehicleFormValues>();

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
    label: customer.companyName ?? customer.name ?? customer.contactPerson ?? "未命名客户",
    value: customer.id
  }));

  const createMutation = useMutation({
    mutationFn: async (values: CreateCustomerFormValues) => {
      if (!storeId) throw new Error("当前账号尚未加入门店");
      const customer = await customerApi.create(toCreateCustomerPayload(storeId, values));
      const vehiclePayloads = toCreateVehiclePayloads(customer.id, values);
      if (vehiclePayloads.length) {
        await Promise.all(vehiclePayloads.map((payload) => customerApi.createVehicle(payload)));
      }
      return { customer, vehicleCount: vehiclePayloads.length };
    },
    onSuccess: ({ vehicleCount }) => {
      message.success(vehicleCount > 0 ? `客户和 ${vehicleCount} 辆车已创建` : "客户已创建");
      setCreateOpen(false);
      setCreateCustomerType("PERSONAL");
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["customers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const updateMutation = useMutation({
    mutationFn: (values: EditCustomerFormValues) => {
      if (!editCustomer) throw new Error("请选择要编辑的客户");
      return customerApi.update(editCustomer.id, compactPayload(values));
    },
    onSuccess: (_, values) => {
      message.success("客户已更新");
      if (editCustomer) {
        const updatedCustomer = { ...editCustomer, ...compactPayload(values), updatedAt: new Date().toISOString() };
        setSelectedCustomer((current) => (current?.id === editCustomer.id ? updatedCustomer : current));
      }
      setEditCustomer(null);
      setEditCustomerType("PERSONAL");
      editForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ["customers", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const vehicleMutation = useMutation({
    mutationFn: (values: VehicleFormValues) => {
      if (!vehicleCustomer) throw new Error("请选择要维护车辆的客户");
      const payload = normalizeVehiclePayload(values);
      if (editingVehicle) {
        return customerApi.updateVehicle(editingVehicle.id, payload);
      }
      return customerApi.createVehicle({
        customerId: vehicleCustomer.id,
        carModel: payload.carModel ?? "",
        carPlate: payload.carPlate,
        vin: payload.vin,
        carColor: payload.carColor,
        photoUrl: payload.photoUrl
      });
    },
    onSuccess: () => {
      message.success(editingVehicle ? "车辆已更新" : "车辆已新增");
      setVehicleCustomer(null);
      setEditingVehicle(null);
      vehicleForm.resetFields();
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

  const openEditCustomer = (customer: CustomerRow) => {
    const customerType = customer.customerType === "COMPANY" ? "COMPANY" : "PERSONAL";
    setEditCustomer(customer);
    setEditCustomerType(customerType);
    editForm.setFieldsValue({
      customerType,
      name: customer.name ?? undefined,
      gender: customer.gender as EditCustomerFormValues["gender"],
      birthday: toDateInputValue(customer.birthday),
      companyName: customer.companyName ?? undefined,
      contactPerson: customer.contactPerson ?? undefined,
      wechat: customer.wechat ?? undefined,
      sourceType: customer.sourceType as EditCustomerFormValues["sourceType"],
      sourceDetail: customer.sourceDetail ?? undefined
    });
  };

  const closeEditDrawer = () => {
    if (updateMutation.isPending) return;
    setEditCustomer(null);
    setEditCustomerType("PERSONAL");
    editForm.resetFields();
  };

  const openVehicleDrawer = (customer: CustomerRow, vehicle?: CustomerVehicle) => {
    setVehicleCustomer(customer);
    setEditingVehicle(vehicle ?? null);
    vehicleForm.resetFields();
    vehicleForm.setFieldsValue({
      carModel: vehicle?.carModel ?? undefined,
      carPlate: vehicle?.carPlate ?? undefined,
      vin: vehicle?.vin ?? undefined,
      carColor: vehicle?.carColor ?? undefined,
      photoUrl: vehicle?.photoUrl ?? undefined
    });
  };

  const closeVehicleDrawer = () => {
    if (vehicleMutation.isPending) return;
    setVehicleCustomer(null);
    setEditingVehicle(null);
    vehicleForm.resetFields();
  };

  const uploadVehiclePhoto = async (
    options: UploadRequestOption,
    onUploaded: (url: string) => void,
    setUploading: (uploading: boolean) => void
  ) => {
    setUploading(true);
    try {
      const result = await customerApi.uploadVehiclePhoto(options.file as File);
      onUploaded(result.url);
      message.success("车辆照片已上传");
      options.onSuccess?.(result);
    } catch (error) {
      const uploadError = error as Error;
      message.error(uploadError.message);
      options.onError?.(uploadError);
    } finally {
      setUploading(false);
    }
  };

  const handleVehiclePhotoUpload = (options: UploadRequestOption) => {
    void uploadVehiclePhoto(
      options,
      (url) => vehicleForm.setFieldValue("photoUrl", url),
      setVehiclePhotoUploading
    );
  };

  const handleCreateVehiclePhotoUpload = (fieldName: number) => (options: UploadRequestOption) => {
    void uploadVehiclePhoto(
      options,
      (url) => createForm.setFieldValue(["vehicles", fieldName, "photoUrl"], url),
      setCreateVehiclePhotoUploading
    );
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
                          <dd>{metrics.activeWarrantyCount > 0 ? <Tag color="success">{metrics.activeWarrantyCount} 份</Tag> : <Tag>待质保录入</Tag>}</dd>
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
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditCustomer(row);
                          }}
                        >
                          编辑客户
                        </Button>
                        <Button
                          size="small"
                          icon={<CarOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openVehicleDrawer(row);
                          }}
                        >
                          {getVehicleActionLabel(row)}
                        </Button>
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
                      <Tag>待质保录入</Tag>
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
                  width: 132,
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
                      <Tooltip title="编辑客户">
                        <Button
                          aria-label="编辑客户"
                          type="text"
                          icon={<EditOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openEditCustomer(row);
                          }}
                        />
                      </Tooltip>
                      <Tooltip title={getVehicleActionLabel(row)}>
                        <Button
                          aria-label={getVehicleActionLabel(row)}
                          type="text"
                          icon={<CarOutlined />}
                          onClick={(event) => {
                            event.stopPropagation();
                            openVehicleDrawer(row);
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
                <Button icon={<EditOutlined />} onClick={() => openEditCustomer(selectedCustomer)}>
                  编辑客户
                </Button>
                <Button icon={<CarOutlined />} onClick={() => openVehicleDrawer(selectedCustomer)}>
                  {getVehicleActionLabel(selectedCustomer)}
                </Button>
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
          className="customers-edit-drawer"
          open={Boolean(editCustomer)}
          title="编辑客户"
          onClose={closeEditDrawer}
          destroyOnHidden
          footer={
            <div className="customers-create-drawer-footer">
              <Button onClick={closeEditDrawer}>取消</Button>
              <Button type="primary" loading={updateMutation.isPending} onClick={() => editForm.submit()}>
                保存修改
              </Button>
            </div>
          }
        >
          <Form<EditCustomerFormValues>
            form={editForm}
            layout="vertical"
            className="customers-create-form"
            onValuesChange={(changedValues) => {
              if ("customerType" in changedValues) {
                setEditCustomerType(changedValues.customerType ?? "PERSONAL");
              }
            }}
            onFinish={(values) => updateMutation.mutate(values)}
          >
            <Form.Item name="customerType" label="客户类型" rules={[{ required: true, message: "请选择客户类型" }]}>
              <Select
                options={[
                  { label: "个人客户", value: "PERSONAL" },
                  { label: "企业客户", value: "COMPANY" }
                ]}
              />
            </Form.Item>

            {editCustomerType === "COMPANY" ? (
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Form.Item
                name="phone"
                label="变更手机号"
                rules={[{ pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }]}
              >
                <Input maxLength={11} placeholder="不填写则保持原手机号" />
              </Form.Item>
              <Form.Item name="wechat" label="微信号">
                <Input maxLength={50} />
              </Form.Item>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            </div>
          </Form>
        </Drawer>

        <Drawer
          className="customers-vehicle-drawer"
          open={Boolean(vehicleCustomer)}
          title="车辆管理"
          onClose={closeVehicleDrawer}
          destroyOnHidden
          footer={
            <div className="customers-create-drawer-footer">
              <Button onClick={closeVehicleDrawer}>取消</Button>
              <Button type="primary" loading={vehicleMutation.isPending} onClick={() => vehicleForm.submit()}>
                保存车辆
              </Button>
            </div>
          }
        >
          <Form<VehicleFormValues>
            form={vehicleForm}
            layout="vertical"
            className="customers-create-form"
            onFinish={(values) => vehicleMutation.mutate(values)}
          >
            {vehicleCustomer ? (
              <section className="customers-form-section customers-vehicle-list">
                <div className="customers-form-section-title">
                  <h4>已有车辆</h4>
                  <Button size="small" icon={<PlusOutlined />} onClick={() => openVehicleDrawer(vehicleCustomer)}>
                    新增车辆
                  </Button>
                </div>
                {vehicleCustomer.vehicles?.length ? (
                  vehicleCustomer.vehicles?.map((vehicle) => (
                    <article key={vehicle.id} className="customers-vehicle-list-item">
                      <div>
                        <strong>{vehicle.carPlate ?? "未录车牌"}</strong>
                        <span>{[vehicle.carModel, vehicle.carColor].filter(Boolean).join(" / ") || "车辆信息待完善"}</span>
                      </div>
                      <Button size="small" onClick={() => openVehicleDrawer(vehicleCustomer, vehicle)}>
                        编辑车辆
                      </Button>
                    </article>
                  ))
                ) : (
                  <div className="customers-vehicle-empty">暂无车辆档案，可在下方新增。</div>
                )}
              </section>
            ) : null}
            <section className="customers-form-section">
              <div className="customers-form-section-title">
                <h4>{editingVehicle ? "编辑车辆" : "新增车辆"}</h4>
                <span>{vehicleCustomer ? getCustomerName(vehicleCustomer) : "选择客户后维护车辆"}</span>
              </div>
              <Form.Item
                name="carModel"
                label="车型"
                rules={[{ required: true, whitespace: true, message: "请输入车型" }]}
              >
                <Input maxLength={100} placeholder="例如 宝马 5 系" />
              </Form.Item>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Form.Item name="carPlate" label="车牌号">
                  <Input maxLength={20} />
                </Form.Item>
                <Form.Item name="vin" label="车架号 VIN">
                  <Input maxLength={50} />
                </Form.Item>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Form.Item name="carColor" label="车身颜色">
                  <Input maxLength={50} />
                </Form.Item>
                <Form.Item name="photoUrl" label="车辆照片" hidden>
                  <Input type="hidden" />
                </Form.Item>
                <Form.Item shouldUpdate={(previous, current) => previous.photoUrl !== current.photoUrl} noStyle>
                  {({ getFieldValue }) => (
                    <div className="customers-vehicle-photo-upload">
                      <Upload accept="image/*" showUploadList={false} customRequest={handleVehiclePhotoUpload}>
                        <Button icon={<UploadOutlined />} loading={vehiclePhotoUploading}>
                          直接上传车辆照片
                        </Button>
                      </Upload>
                      {getFieldValue("photoUrl") ? (
                        <a href={getFieldValue("photoUrl")} target="_blank" rel="noreferrer">
                          查看已上传照片
                        </a>
                      ) : (
                        <span>支持 JPG、PNG 等图片，上传后自动写入车辆档案。</span>
                      )}
                    </div>
                  )}
                </Form.Item>
              </div>
            </section>
          </Form>
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
                <Form.List name="companyUsers">
                  {(fields, { add, remove }) => (
                    <section className="customers-form-section">
                      <div className="customers-form-section-title">
                        <h4>企业用户</h4>
                        <Button size="small" icon={<PlusOutlined />} onClick={() => add({})}>
                          增加用户
                        </Button>
                      </div>
                      {fields.length > 0 ? (
                        <div className="customers-vehicle-draft-list">
                          {fields.map((field, index) => (
                            <article key={field.key} className="customers-vehicle-draft">
                              <div className="customers-form-section-title">
                                <h4>用户 {index + 1}</h4>
                                <Button size="small" onClick={() => remove(field.name)}>
                                  删除用户
                                </Button>
                              </div>
                              <Form.Item
                                name={[field.name, "name"]}
                                label="用户姓名"
                                rules={[{ required: true, whitespace: true, message: "请输入用户姓名" }]}
                              >
                                <Input maxLength={50} />
                              </Form.Item>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <Form.Item
                                  name={[field.name, "phone"]}
                                  label="手机号"
                                  rules={[{ pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }]}
                                >
                                  <Input maxLength={11} />
                                </Form.Item>
                                <Form.Item name={[field.name, "note"]} label="备注">
                                  <Input maxLength={100} />
                                </Form.Item>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div className="customers-vehicle-empty">企业客户下可维护多个用户，暂不区分角色。</div>
                      )}
                    </section>
                  )}
                </Form.List>
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

            <Form.List name="vehicles">
              {(fields, { add, remove }) => (
                <section className="customers-form-section">
                  <div className="customers-form-section-title">
                    <h4>车辆档案</h4>
                    <Button size="small" icon={<PlusOutlined />} onClick={() => add({})}>
                      增加车辆
                    </Button>
                  </div>
                  {fields.length > 0 ? (
                    <div className="customers-vehicle-draft-list">
                      {fields.map((field, index) => (
                        <article key={field.key} className="customers-vehicle-draft">
                          <div className="customers-form-section-title">
                            <h4>车辆 {index + 1}</h4>
                            <Button size="small" onClick={() => remove(field.name)}>
                              删除车辆
                            </Button>
                          </div>
                          <Form.Item
                            name={[field.name, "carModel"]}
                            label="车型"
                            rules={[{ required: true, whitespace: true, message: "请输入车型" }]}
                          >
                            <Input maxLength={100} placeholder="例如 宝马 5 系" />
                          </Form.Item>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Form.Item name={[field.name, "carPlate"]} label="车牌号">
                              <Input maxLength={20} />
                            </Form.Item>
                            <Form.Item name={[field.name, "vin"]} label="车架号 VIN">
                              <Input maxLength={50} />
                            </Form.Item>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Form.Item name={[field.name, "carColor"]} label="车身颜色">
                              <Input maxLength={50} />
                            </Form.Item>
                            <Form.Item name={[field.name, "photoUrl"]} label="车辆照片" hidden>
                              <Input type="hidden" />
                            </Form.Item>
                            <Form.Item
                              shouldUpdate={(previous, current) =>
                                previous.vehicles?.[field.name]?.photoUrl !== current.vehicles?.[field.name]?.photoUrl
                              }
                              noStyle
                            >
                              {({ getFieldValue }) => {
                                const photoUrl = getFieldValue(["vehicles", field.name, "photoUrl"]) as string | undefined;
                                return (
                                  <div className="customers-vehicle-photo-upload">
                                    <Upload
                                      accept="image/*"
                                      showUploadList={false}
                                      customRequest={handleCreateVehiclePhotoUpload(field.name)}
                                    >
                                      <Button icon={<UploadOutlined />} loading={createVehiclePhotoUploading}>
                                        直接上传车辆照片
                                      </Button>
                                    </Upload>
                                    {photoUrl ? (
                                      <a href={photoUrl} target="_blank" rel="noreferrer">
                                        查看已上传照片
                                      </a>
                                    ) : (
                                      <span>支持 JPG、PNG 等图片，上传后自动写入车辆档案。</span>
                                    )}
                                  </div>
                                );
                              }}
                            </Form.Item>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="customers-vehicle-empty">可在创建客户时同步添加一辆或多辆车，也可以之后在客户列表中维护。</div>
                  )}
                </section>
              )}
            </Form.List>
          </Form>
        </Drawer>
    </>
  );
}

function CustomerDetailDrawer({ customer }: { customer: CustomerRow }) {
  const metrics = getCustomerAutoArchiveMetrics(customer);
  const tags = getCustomerTags(customer, metrics.systemTagLabels);
  const vehicles = customer.vehicles ?? [];
  const companyUsers = customer.users ?? [];

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

      {customer.customerType === "COMPANY" ? (
        <section className="customers-drawer-section">
          <div className="customers-drawer-section-title">
            <h4>企业用户 ({companyUsers.length})</h4>
            <span>企业客户下就是用户，暂不区分角色</span>
          </div>
          {companyUsers.length > 0 ? (
            <div className="customers-drawer-vehicle-list">
              {companyUsers.map((companyUser) => (
                <article key={companyUser.id} className="customers-drawer-vehicle">
                  <div className="customers-drawer-vehicle-thumb">用</div>
                  <div>
                    <strong>{companyUser.name ?? "未命名用户"}</strong>
                    <span>{companyUser.note ?? "暂无备注"}</span>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无企业用户" />
          )}
        </section>
      ) : null}

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

function getVehicleActionLabel(row: CustomerRow) {
  return (row.vehicles?.length ?? 0) > 0 ? "编辑车辆" : "新增车辆";
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

function toDateInputValue(value?: string | null) {
  if (!value) return undefined;
  return value.slice(0, 10);
}

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")
  ) as T;
}

function normalizeVehiclePayload(values: VehicleFormValues) {
  return compactPayload({
    carModel: trimOptional(values.carModel),
    carPlate: trimOptional(values.carPlate),
    vin: trimOptional(values.vin),
    carColor: trimOptional(values.carColor),
    photoUrl: trimOptional(values.photoUrl)
  });
}

function trimOptional(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
        classNames={{ popup: { root: "customers-birthday-year-popup" } }}
        options={yearOptions}
        placeholder="年份"
        popupMatchSelectWidth={false}
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
