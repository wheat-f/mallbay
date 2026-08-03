"use client";

import {
  App,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  Select,
  Skeleton,
  Table,
  Tag,
  Typography,
  Upload
} from "antd";
import {
  ArrowLeftOutlined,
  BankOutlined,
  CarOutlined,
  CheckCircleOutlined,
  EditOutlined,
  FileTextOutlined,
  HistoryOutlined,
  PlusOutlined,
  StopOutlined,
  SwapOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import type { UploadProps } from "antd";
import { customerApi } from "../../../src/lib/api";
import type {
  CreateCustomerNotePayload,
  CreateCustomerPayload,
  CreateCustomerTagPayload,
  CreateVehiclePayload,
  CustomerVehicleHistoryItem,
  UpdateVehiclePayload
} from "../../../src/features/customers/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import {
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel,
  getCustomerConsumptionTrendRows,
  getCustomerProfileNotes,
  getWarrantyStatusLabel
} from "../../../src/features/customers/display";
import { getOrderStatusLabel } from "../../../src/features/orders/order-display";

type CustomerDetail = {
  id: string;
  storeId: string;
  customerType: "PERSONAL" | "COMPANY";
  name?: string | null;
  phone?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
  gender?: string | null;
  birthday?: string | null;
  wechat?: string | null;
  sourceType?: string | null;
  sourceDetail?: string | null;
  owner?: { username?: string | null; nickname?: string | null } | null;
  referrer?: { id: string; name?: string | null; companyName?: string | null; contactPerson?: string | null } | null;
  tags?: CustomerTag[];
  systemTags?: SystemCustomerTag[];
  customTags?: CustomerTag[];
  vehicles?: CustomerVehicle[];
  users?: CustomerContact[];
  notes?: CustomerNote[];
  orders?: CustomerOrder[];
  warranties?: CustomerWarranty[];
  afterSales?: CustomerAfterSale[];
  archiveSummary?: CustomerArchiveSummary;
};

type CustomerVehicle = {
  id: string;
  carPlate?: string | null;
  carModel: string;
  carColor?: string | null;
  photoUrl?: string | null;
  vehicleTypeCode?: "SMALL_CAR" | "STANDARD_CAR" | "LUXURY_LARGE_CAR" | null;
  status: "ACTIVE" | "INACTIVE";
  defaultContactId?: string | null;
  department?: string | null;
  disabledReason?: string | null;
};

type CustomerContact = {
  id: string;
  name: string;
  role?: "DECISION_MAKER" | "DRIVER" | "FINANCE" | "OTHER" | null;
  department?: string | null;
  isDefault?: boolean;
};

type CustomerListItem = {
  id: string;
  name?: string | null;
  companyName?: string | null;
  contactPerson?: string | null;
};

type CustomerNote = {
  id: string;
  noteType?: string | null;
  content: string;
  createdAt: string;
};

type CustomerTag = {
  id: string;
  label: string;
};

type SystemCustomerTag = {
  code: string;
  label: string;
  level: string;
  reasons: string[];
};

type CustomerOrder = {
  id: string;
  orderNo: string;
  status: string;
  createdAt: string;
  amount?: {
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
  } | null;
  vehicle?: CustomerVehicle | null;
};

type CustomerWarranty = {
  id: string;
  warrantyNo?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
};

type CustomerAfterSale = {
  id: string;
  status: string;
  responsibility?: string | null;
  issueType?: string | null;
  description?: string | null;
  createdAt?: string | null;
};

type CustomerArchiveSummary = {
  consumption: {
    orderCount: number;
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
    constructionTypeDistribution: Record<string, number>;
    firstConsumedAt?: string | null;
    latestConsumedAt?: string | null;
    trend?: Array<{
      month: string;
      orderCount: number;
      totalAmountCents: number;
      paidAmountCents: number;
      outstandingCents: number;
    }>;
  };
  warranty: {
    activeCount: number;
    expiredCount: number;
    expiringSoonCount: number;
    latestEndDate?: string | null;
  };
  afterSales: {
    totalCount: number;
    openCount: number;
    closedCount: number;
    responsibilityDistribution: Record<string, number>;
  };
  systemTags: SystemCustomerTag[];
};

type EditCustomerFormValues = Partial<CreateCustomerPayload>;
type VehicleFormValues = Omit<CreateVehiclePayload, "customerId">;
type NoteFormValues = Pick<CreateCustomerNotePayload, "content" | "noteType">;
type TagFormValues = Pick<CreateCustomerTagPayload, "label">;
type VehicleLifecycleFormValues = { reason: string };
type VehicleTransferFormValues = { toCustomerId: string; reason: string };
type UploadRequestOption = Parameters<NonNullable<UploadProps["customRequest"]>>[0];

const sourceLabels: Record<string, string> = {
  ONLINE_DOUYIN: "抖音",
  ONLINE_XIAOHONGSHU: "小红书",
  ONLINE_KUAISHOU: "快手",
  OFFLINE_STORE: "到店",
  REFERRAL: "转介绍",
  PARTNER: "合作方",
  OTHER: "其他"
};

const genderLabels: Record<string, string> = {
  MALE: "男",
  FEMALE: "女",
  UNKNOWN: "未知"
};

const noteTypeLabels: Record<string, string> = {
  PREFERENCE: "客户偏好",
  REQUIREMENT: "特殊要求",
  COMMUNICATION: "沟通记录"
};

const vehicleTypeLabels: Record<string, string> = {
  SMALL_CAR: "小车",
  STANDARD_CAR: "常规车",
  LUXURY_LARGE_CAR: "豪车/大车"
};

const contactRoleLabels: Record<string, string> = {
  DECISION_MAKER: "决策人",
  DRIVER: "司机",
  FINANCE: "财务联系人",
  OTHER: "其他"
};

const vehicleHistoryActionLabels: Record<CustomerVehicleHistoryItem["action"], string> = {
  CREATE: "新增车辆",
  UPDATE: "修改车辆",
  DISABLE: "停用车辆",
  ENABLE: "启用车辆",
  TRANSFER: "转移车辆"
};

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editForm] = Form.useForm<EditCustomerFormValues>();
  const [vehicleForm] = Form.useForm<VehicleFormValues>();
  const [vehicleLifecycleForm] = Form.useForm<VehicleLifecycleFormValues>();
  const [vehicleTransferForm] = Form.useForm<VehicleTransferFormValues>();
  const [noteForm] = Form.useForm<NoteFormValues>();
  const [tagForm] = Form.useForm<TagFormValues>();
  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [vehicleDrawerOpen, setVehicleDrawerOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<CustomerVehicle | null>(null);
  const [lifecycleVehicle, setLifecycleVehicle] = useState<CustomerVehicle | null>(null);
  const [transferVehicle, setTransferVehicle] = useState<CustomerVehicle | null>(null);
  const [historyVehicle, setHistoryVehicle] = useState<CustomerVehicle | null>(null);
  const [vehiclePhotoUploading, setVehiclePhotoUploading] = useState(false);
  const currentUser = useAuthStore((state) => state.user);
  const isManager = currentUser?.storeMember?.position === "MANAGER";
  const customerId = params.id;
  const detailQueryKey = ["customer-detail", customerId];

  const customerQuery = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => customerApi.detail(customerId)
  });
  const customer = customerQuery.data as CustomerDetail | undefined;
  const summary = customer?.archiveSummary;
  const profileNotes = getCustomerProfileNotes({ notes: customer?.notes ?? [] });
  const consumptionTrendRows = getCustomerConsumptionTrendRows({ archiveSummary: summary });

  const updateMutation = useMutation({
    mutationFn: (values: EditCustomerFormValues) =>
      customerApi.update(customerId, compactPayload(values)),
    onSuccess: () => {
      message.success("客户基础信息已更新");
      setEditDrawerOpen(false);
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const vehicleMutation = useMutation({
    mutationFn: (values: VehicleFormValues) => {
      const payload = compactPayload(values);
      return editingVehicle
        ? customerApi.updateVehicle(editingVehicle.id, payload as UpdateVehiclePayload)
        : customerApi.createVehicle({ ...payload, customerId } as CreateVehiclePayload);
    },
    onSuccess: () => {
      message.success(editingVehicle ? "车辆信息已更新" : "车辆已添加");
      setVehicleDrawerOpen(false);
      setEditingVehicle(null);
      vehicleForm.resetFields();
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });


  const transferTargetsQuery = useQuery({
    queryKey: ["customer-transfer-targets", customer?.storeId],
    queryFn: () => customerApi.list({ storeId: customer!.storeId, page: 1, pageSize: 100 }),
    enabled: Boolean(transferVehicle && customer?.storeId)
  });

  const vehicleHistoryQuery = useQuery({
    queryKey: ["customer-vehicle-history", historyVehicle?.id],
    queryFn: () => customerApi.vehicleHistory(historyVehicle!.id),
    enabled: Boolean(historyVehicle)
  });

  const lifecycleMutation = useMutation({
    mutationFn: (values: VehicleLifecycleFormValues) =>
      customerApi.changeVehicleStatus(
        lifecycleVehicle!.id,
        lifecycleVehicle!.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
        values.reason.trim()
      ),
    onSuccess: () => {
      message.success(lifecycleVehicle?.status === "ACTIVE" ? "车辆已停用" : "车辆已启用");
      setLifecycleVehicle(null);
      vehicleLifecycleForm.resetFields();
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const transferMutation = useMutation({
    mutationFn: (values: VehicleTransferFormValues) =>
      customerApi.transferVehicle(transferVehicle!.id, values.toCustomerId, values.reason.trim()),
    onSuccess: () => {
      message.success("车辆归属已转移");
      setTransferVehicle(null);
      vehicleTransferForm.resetFields();
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });
  const noteMutation = useMutation({
    mutationFn: (values: NoteFormValues) =>
      customerApi.createNote({
        customerId,
        noteType: values.noteType ?? "COMMUNICATION",
        content: values.content.trim()
      }),
    onSuccess: () => {
      message.success("跟进记录已添加");
      noteForm.resetFields();
      noteForm.setFieldValue("noteType", "COMMUNICATION");
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const tagMutation = useMutation({
    mutationFn: (values: TagFormValues) =>
      customerApi.createTag({ customerId, label: values.label.trim() }),
    onSuccess: () => {
      message.success("客户标签已添加");
      tagForm.resetFields();
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const deleteTagMutation = useMutation({
    mutationFn: (id: string) => customerApi.deleteTag(id),
    onSuccess: () => {
      message.success("客户标签已删除");
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const openEditDrawer = () => {
    if (!customer) return;
    editForm.setFieldsValue({
      customerType: customer.customerType,
      name: customer.name ?? undefined,
      gender: customer.gender as CreateCustomerPayload["gender"],
      birthday: toDateInputValue(customer.birthday),
      companyName: customer.companyName ?? undefined,
      contactPerson: customer.contactPerson ?? undefined,
      wechat: customer.wechat ?? undefined,
      sourceType: customer.sourceType as CreateCustomerPayload["sourceType"],
      sourceDetail: customer.sourceDetail ?? undefined
    });
    setEditDrawerOpen(true);
  };

  const submitEditDrawer = async () => {
    const values = await editForm.validateFields();
    await updateMutation.mutateAsync(values);
  };

  const openVehicleDrawer = (vehicle?: CustomerVehicle) => {
    setEditingVehicle(vehicle ?? null);
    vehicleForm.resetFields();
    vehicleForm.setFieldsValue(vehicle
      ? {
          carPlate: vehicle.carPlate ?? undefined,
          carModel: vehicle.carModel,
          carColor: vehicle.carColor ?? undefined,
          photoUrl: vehicle.photoUrl ?? undefined,
          vehicleTypeCode: vehicle.vehicleTypeCode ?? undefined,
          defaultContactId: vehicle.defaultContactId ?? undefined,
          department: vehicle.department ?? undefined
        }
      : { vehicleTypeCode: "STANDARD_CAR" });
    setVehicleDrawerOpen(true);
  };

  const closeVehicleDrawer = () => {
    setVehicleDrawerOpen(false);
    setEditingVehicle(null);
    vehicleForm.resetFields();
  };

  const submitVehicleDrawer = async () => {
    const values = await vehicleForm.validateFields();
    if (!editingVehicle && !values.carPlate?.trim() && !values.vin?.trim()) {
      message.error("车牌号或车架号 VIN 至少填写一项");
      return;
    }
    await vehicleMutation.mutateAsync(values);
  };

  const submitVehicleLifecycle = async () => {
    const values = await vehicleLifecycleForm.validateFields();
    await lifecycleMutation.mutateAsync(values);
  };

  const submitVehicleTransfer = async () => {
    const values = await vehicleTransferForm.validateFields();
    await transferMutation.mutateAsync(values);
  };

  const handleVehiclePhotoUpload = async (options: UploadRequestOption) => {
    setVehiclePhotoUploading(true);
    try {
      const result = await customerApi.uploadVehiclePhoto(options.file as File);
      vehicleForm.setFieldValue("photoUrl", result.url);
      message.success("车辆照片已上传");
      options.onSuccess?.(result);
    } catch (error) {
      const uploadError = error as Error;
      message.error(uploadError.message);
      options.onError?.(uploadError);
    } finally {
      setVehiclePhotoUploading(false);
    }
  };

  return (
    <div className="management-page">
      {customerQuery.isLoading ? (
        <Skeleton active />
      ) : !customer ? (
        <Empty description="客户不存在或无权访问" />
      ) : (
        <>
          <section className="customer-detail-hero">
            <div className="customer-detail-avatar">{getCustomerInitial(customer)}</div>
            <div className="customer-detail-identity">
              <div className="customer-detail-breadcrumb">
                <span>客户管理</span>
                <span>/</span>
                <span>客户详情</span>
              </div>
              <div className="customer-detail-title-row">
                <h1>{getCustomerDisplayName(customer)}</h1>
                <Tag>{customer.customerType === "COMPANY" ? "企业客户" : "个人客户"}</Tag>
                {(customer.systemTags ?? summary?.systemTags ?? []).map((tag) => (
                  <Tag key={tag.code} color={tag.code === "KEY_FOLLOW_UP" ? "red" : "blue"}>
                    {tag.label}
                  </Tag>
                ))}
              </div>
              <div className="customer-detail-meta">
                <span>{customer.phone ?? "手机号未维护"}</span>
                <span>{getPrimaryVehicleLabel(customer)}</span>
                <span>归属销售：{customer.owner?.nickname ?? customer.owner?.username ?? "-"}</span>
              </div>
            </div>
            <div className="customer-detail-actions">
              <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/customers")}>
                返回客户列表
              </Button>
              <Button icon={<EditOutlined />} disabled={!customer} onClick={openEditDrawer}>
                编辑资料
              </Button>
              {customer.customerType === "COMPANY" ? (
                <Button
                  icon={<BankOutlined />}
                  onClick={() => router.push(`/customers/${customerId}/settlement`)}
                >
                  企业对账
                </Button>
              ) : null}
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                disabled={!customer}
                onClick={() => router.push(`/orders/create?customerId=${customerId}`)}
              >
                新建订单
              </Button>
            </div>
            <div className="customer-detail-hero-summary">
              <div>
                <span>累计消费</span>
                <strong>{formatCurrency(summary?.consumption.totalAmountCents)}</strong>
                <p>待收 {formatCurrency(summary?.consumption.outstandingCents)}</p>
              </div>
              <div>
                <span>名下车辆</span>
                <strong>{customer.vehicles?.length ?? 0} 辆</strong>
                <p>有效质保 {summary?.warranty.activeCount ?? 0} 个</p>
              </div>
            </div>
          </section>

          <section className="customer-detail-workspace">
            <div className="customer-detail-main">
              <Card
                className="customer-detail-card customer-vehicle-card"
                title="车辆信息"
                extra={
                  <Button size="small" icon={<PlusOutlined />} onClick={() => openVehicleDrawer()}>
                    新增车辆
                  </Button>
                }
              >
                <div className="customer-vehicle-grid">
                  {(customer.vehicles ?? []).map((vehicle) => (
                    <div key={vehicle.id} className="customer-vehicle-item">
                      <div className="customer-vehicle-thumb">
                        {vehicle.photoUrl ? (
                          <Image
                            alt={`${vehicle.carModel} 车辆照片`}
                            height={64}
                            src={vehicle.photoUrl}
                            width={92}
                          />
                        ) : (
                          <CarOutlined />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{vehicle.carPlate ?? vehicle.carModel}</strong>
                          <Tag color={vehicle.status === "ACTIVE" ? "green" : "default"}>
                            {vehicle.status === "ACTIVE" ? "在用" : "已停用"}
                          </Tag>
                        </div>
                        <span>{[
                          vehicle.carModel,
                          vehicle.carColor,
                          vehicle.vehicleTypeCode ? vehicleTypeLabels[vehicle.vehicleTypeCode] : "车型类型待维护"
                        ].filter(Boolean).join(" / ")}</span>
                        <Typography.Text type="secondary" className="block text-xs">
                          {vehicle.department ? `使用部门：${vehicle.department}` : "使用部门未维护"}
                          {" · "}
                          {vehicle.defaultContactId
                            ? `默认联系人：${customer.users?.find((contact) => contact.id === vehicle.defaultContactId)?.name ?? "已设置"}`
                            : "默认联系人未设置"}
                        </Typography.Text>
                        {vehicle.disabledReason ? (
                          <Typography.Text type="secondary" className="block text-xs">停用原因：{vehicle.disabledReason}</Typography.Text>
                        ) : null}
                        <div className="mt-2 flex flex-wrap gap-1">
                          <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openVehicleDrawer(vehicle)}>
                            编辑
                          </Button>
                          <Button size="small" type="text" icon={<HistoryOutlined />} onClick={() => setHistoryVehicle(vehicle)}>
                            历史
                          </Button>
                          {isManager ? (
                            <>
                              <Button size="small" type="text" icon={<SwapOutlined />} onClick={() => setTransferVehicle(vehicle)}>
                                转移
                              </Button>
                              <Button
                                size="small"
                                type="text"
                                danger={vehicle.status === "ACTIVE"}
                                icon={vehicle.status === "ACTIVE" ? <StopOutlined /> : <CheckCircleOutlined />}
                                onClick={() => setLifecycleVehicle(vehicle)}
                              >
                                {vehicle.status === "ACTIVE" ? "停用" : "启用"}
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                  {(customer.vehicles ?? []).length === 0 ? <Typography.Text type="secondary">暂无车辆</Typography.Text> : null}
                </div>
              </Card>

              <Card className="customer-detail-card customer-history-card" title="消费记录">
                <div className="customer-trend-list">
                  {consumptionTrendRows.slice(0, 4).map((row) => (
                    <div key={row.month} className="customer-trend-row">
                      <div>
                        <strong>{row.month}</strong>
                        <span>{row.orderCountLabel} / 已收 {row.paidAmountLabel}</span>
                      </div>
                      <div className="customer-trend-meter">
                        <i style={{ width: `${row.percentOfMax}%` }} />
                      </div>
                      <b>{row.totalAmountLabel}</b>
                    </div>
                  ))}
                  {consumptionTrendRows.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消费趋势" /> : null}
                </div>
                <div className="customer-record-mobile-cards customer-order-mobile-cards">
                  {(customer.orders ?? []).map((order) => (
                    <article className="customer-record-mobile-card customer-order-mobile-card" key={order.id}>
                      <div className="customer-record-mobile-card-head">
                        <div>
                          <strong>{order.orderNo}</strong>
                          <span>{formatDateTime(order.createdAt)}</span>
                        </div>
                        <Tag>{getOrderStatusLabel(order.status)}</Tag>
                      </div>
                      <dl className="customer-record-mobile-fields">
                        <div>
                          <dt>车辆</dt>
                          <dd>{order.vehicle?.carPlate ?? order.vehicle?.carModel ?? "-"}</dd>
                        </div>
                        <div>
                          <dt>金额</dt>
                          <dd>{formatCurrency(order.amount?.totalAmountCents)}</dd>
                        </div>
                        <div>
                          <dt>待收</dt>
                          <dd>{formatCurrency(order.amount?.outstandingCents)}</dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                  {(customer.orders ?? []).length === 0 ? <div className="customer-record-mobile-empty">暂无订单</div> : null}
                </div>
                <Table<CustomerOrder>
                  className="customer-record-desktop-table"
                  rowKey="id"
                  pagination={false}
                  dataSource={customer.orders ?? []}
                  locale={{ emptyText: "暂无订单" }}
                  columns={[
                    { title: "订单号", dataIndex: "orderNo" },
                    {
                      title: "车辆",
                      render: (_, order) => order.vehicle?.carPlate ?? order.vehicle?.carModel ?? "-"
                    },
                    {
                      title: "状态",
                      render: (_, order) => <Tag>{getOrderStatusLabel(order.status)}</Tag>
                    },
                    {
                      title: "金额",
                      render: (_, order) => formatCurrency(order.amount?.totalAmountCents)
                    }
                  ]}
                />
              </Card>

              <div className="customer-record-grid">
                <Card className="customer-detail-card customer-warranty-card" title="质保记录">
                  <div className="customer-record-mobile-cards customer-warranty-mobile-cards">
                    {(customer.warranties ?? []).map((warranty) => (
                      <article className="customer-record-mobile-card customer-warranty-mobile-card" key={warranty.id}>
                        <div className="customer-record-mobile-card-head">
                          <div>
                            <strong>{warranty.warrantyNo ?? "未生成质保编号"}</strong>
                            <span>质保编号</span>
                          </div>
                          <Tag>{getWarrantyStatusLabel(warranty.status)}</Tag>
                        </div>
                        <dl className="customer-record-mobile-fields">
                          <div>
                            <dt>开始日期</dt>
                            <dd>{formatDate(warranty.startDate)}</dd>
                          </div>
                          <div>
                            <dt>到期日期</dt>
                            <dd>{formatDate(warranty.endDate)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                    {(customer.warranties ?? []).length === 0 ? <div className="customer-record-mobile-empty">暂无质保记录</div> : null}
                  </div>
                  <Table<CustomerWarranty>
                    className="customer-record-desktop-table"
                    rowKey="id"
                    pagination={false}
                    dataSource={customer.warranties ?? []}
                    locale={{ emptyText: "暂无质保记录" }}
                    columns={[
                      { title: "质保编号", render: (_, warranty) => warranty.warrantyNo ?? "未生成质保编号" },
                      {
                        title: "状态",
                        render: (_, warranty) => <Tag>{getWarrantyStatusLabel(warranty.status)}</Tag>
                      },
                      { title: "到期日期", render: (_, warranty) => formatDate(warranty.endDate) }
                    ]}
                  />
                </Card>

                <Card className="customer-detail-card customer-after-sale-card" title="售后记录">
                  <div className="customer-record-mobile-cards customer-after-sale-mobile-cards">
                    {(customer.afterSales ?? []).map((afterSale) => (
                      <article className="customer-record-mobile-card customer-after-sale-mobile-card" key={afterSale.id}>
                        <div className="customer-record-mobile-card-head">
                          <div>
                            <strong>{afterSale.issueType ?? "售后问题"}</strong>
                            <span>{formatDateTime(afterSale.createdAt)}</span>
                          </div>
                          <Tag>{getAfterSaleStatusLabel(afterSale.status)}</Tag>
                        </div>
                        <dl className="customer-record-mobile-fields">
                          <div>
                            <dt>责任归属</dt>
                            <dd>{getAfterSaleResponsibilityLabel(afterSale.responsibility)}</dd>
                          </div>
                          <div>
                            <dt>问题描述</dt>
                            <dd>{afterSale.description ?? "-"}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                    {(customer.afterSales ?? []).length === 0 ? <div className="customer-record-mobile-empty">暂无售后记录</div> : null}
                  </div>
                  <Table<CustomerAfterSale>
                    className="customer-record-desktop-table"
                    rowKey="id"
                    pagination={false}
                    dataSource={customer.afterSales ?? []}
                    locale={{ emptyText: "暂无售后记录" }}
                    columns={[
                      {
                        title: "状态",
                        render: (_, afterSale) => <Tag>{getAfterSaleStatusLabel(afterSale.status)}</Tag>
                      },
                      {
                        title: "责任",
                        render: (_, afterSale) => getAfterSaleResponsibilityLabel(afterSale.responsibility)
                      },
                      { title: "问题类型", render: (_, afterSale) => afterSale.issueType ?? "-" }
                    ]}
                  />
                </Card>
              </div>
            </div>

            <aside className="customer-detail-side">
              <Card className="customer-detail-card customer-profile-card" title="客户画像">
                <div className="customer-profile-facts">
                  <StatisticLine label="联系人" value={customer.contactPerson ?? customer.name ?? "-"} />
                  <StatisticLine label="性别" value={customer.gender ? genderLabels[customer.gender] ?? customer.gender : "-"} />
                  <StatisticLine label="生日" value={formatDate(customer.birthday)} />
                  <StatisticLine label="微信" value={customer.wechat ?? "-"} />
                  <StatisticLine label="来源" value={customer.sourceType ? sourceLabels[customer.sourceType] ?? customer.sourceType : "-"} />
                  <StatisticLine label="介绍人" value={customer.referrer ? customer.referrer.companyName ?? customer.referrer.name ?? customer.referrer.contactPerson ?? "-" : "-"} />
                </div>
                <div className="customer-profile-notes">
                  <ProfileNoteBlock title="客户偏好" emptyText="暂无客户偏好" notes={profileNotes.preferences} />
                  <ProfileNoteBlock title="特殊要求" emptyText="暂无特殊要求" notes={profileNotes.requirements} />
                </div>
              </Card>

              <Card className="customer-detail-card customer-tags-card" title="客户标签">
                <Typography.Text strong>系统标签</Typography.Text>
                <div className="customer-tag-cloud">
                  {(customer.systemTags ?? summary?.systemTags ?? []).map((tag) => (
                    <Tag key={tag.code} color={tag.code === "KEY_FOLLOW_UP" ? "red" : "blue"} title={tag.reasons?.join("；")}>{tag.label}</Tag>
                  ))}
                  {(customer.systemTags ?? summary?.systemTags ?? []).length === 0 ? <Typography.Text type="secondary">暂无系统标签</Typography.Text> : null}
                </div>
                <Typography.Text strong className="block mt-4">人工标签</Typography.Text>
                <div className="customer-tag-cloud">
                  {(customer.customTags ?? customer.tags ?? []).map((tag) => (
                    <Tag
                      key={tag.id}
                      closable
                      onClose={(event) => {
                        event.preventDefault();
                        deleteTagMutation.mutate(tag.id);
                      }}
                    >
                      {tag.label}
                    </Tag>
                  ))}
                  {(customer.customTags ?? customer.tags ?? []).length === 0 ? <Typography.Text type="secondary">暂无自定义标签</Typography.Text> : null}
                </div>
                <Form<TagFormValues> form={tagForm} layout="vertical" onFinish={(values) => tagMutation.mutate(values)}>
                  <Form.Item name="label" rules={[{ required: true, whitespace: true, message: "请输入标签" }]}>
                    <Input maxLength={30} placeholder="例如 老客户、商务车队" />
                  </Form.Item>
                  <Button htmlType="submit" loading={tagMutation.isPending} block>
                    添加标签
                  </Button>
                </Form>
              </Card>

              <Card className="customer-detail-card customer-notes-card" title="沟通记录">
                <Form<NoteFormValues>
                  form={noteForm}
                  layout="vertical"
                  initialValues={{ noteType: "COMMUNICATION" }}
                  onFinish={(values) => noteMutation.mutate(values)}
                >
                  <Form.Item name="noteType" label="记录类型">
                    <Select
                      options={[
                        { label: "沟通记录", value: "COMMUNICATION" },
                        { label: "客户偏好", value: "PREFERENCE" },
                        { label: "特殊要求", value: "REQUIREMENT" }
                      ]}
                    />
                  </Form.Item>
                  <Form.Item name="content" rules={[{ required: true, whitespace: true, message: "请输入跟进内容" }]}>
                    <Input.TextArea rows={3} maxLength={1000} placeholder="记录偏好、特殊要求或沟通内容" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={noteMutation.isPending} block>
                    添加记录
                  </Button>
                </Form>
              </Card>

              <Card className="customer-detail-card customer-timeline-card" title="近期沟通时间线">
                <div className="customer-timeline">
                  {profileNotes.communications.slice(0, 5).map((note) => (
                    <div key={note.id} className="customer-timeline-item">
                      <span>{formatDateTime(note.createdAt)}</span>
                      <strong>{noteTypeLabels[note.noteType ?? "COMMUNICATION"] ?? "沟通记录"}</strong>
                      <p>{note.content}</p>
                    </div>
                  ))}
                  {profileNotes.communications.length === 0 ? <Typography.Text type="secondary">暂无沟通记录</Typography.Text> : null}
                </div>
              </Card>
            </aside>
          </section>

          <Drawer
            open={editDrawerOpen}
            title="编辑基础信息"
            onClose={() => setEditDrawerOpen(false)}
            placement="right"
            rootClassName="customer-detail-edit-drawer"
            destroyOnHidden
            forceRender
            footer={(
              <div className="customer-detail-drawer-footer">
                <Button onClick={() => setEditDrawerOpen(false)}>取消</Button>
                <Button type="primary" loading={updateMutation.isPending} onClick={submitEditDrawer}>
                  保存
                </Button>
              </div>
            )}
          >
            <Form<EditCustomerFormValues> form={editForm} layout="vertical" className="customer-detail-drawer-form">
              <Form.Item
                name="customerType"
                label="客户类型"
                rules={[{ required: true, message: "请选择客户类型" }]}
              >
                <Select
                  options={[
                    { label: "个人客户", value: "PERSONAL" },
                    { label: "企业客户", value: "COMPANY" }
                  ]}
                />
              </Form.Item>
              <Form.Item noStyle shouldUpdate={(prev, next) => prev.customerType !== next.customerType}>
                {({ getFieldValue }) =>
                  getFieldValue("customerType") === "COMPANY" ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    </div>
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
                          <Input type="date" />
                        </Form.Item>
                      </div>
                    </>
                  )
                }
              </Form.Item>
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
            open={vehicleDrawerOpen}
            title={editingVehicle ? "编辑车辆" : "新增车辆"}
            onClose={closeVehicleDrawer}
            placement="right"
            rootClassName="customer-detail-vehicle-drawer"
            destroyOnHidden
            forceRender
            footer={(
              <div className="customer-detail-drawer-footer">
                <Button onClick={closeVehicleDrawer}>取消</Button>
                <Button type="primary" loading={vehicleMutation.isPending} onClick={submitVehicleDrawer}>
                  保存
                </Button>
              </div>
            )}
          >
            <Form<VehicleFormValues> form={vehicleForm} layout="vertical" className="customer-detail-drawer-form">
              <Form.Item
                name="vehicleTypeCode"
                label="车辆类型"
                rules={[{ required: true, message: "请选择车辆类型" }]}
              >
                <Select
                  placeholder="请选择车辆类型"
                  options={[
                    { label: "小车", value: "SMALL_CAR" },
                    { label: "常规车", value: "STANDARD_CAR" },
                    { label: "豪车/大车", value: "LUXURY_LARGE_CAR" }
                  ]}
                />
              </Form.Item>
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
              <Form.Item name="carColor" label="车身颜色">
                <Input maxLength={50} />
              </Form.Item>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Form.Item name="defaultContactId" label="默认用车联系人">
                  <Select
                    allowClear
                    placeholder="选择该车默认联系人"
                    options={(customer.users ?? []).map((contact) => ({
                      value: contact.id,
                      label: [
                        contact.name,
                        contact.role ? contactRoleLabels[contact.role] : null,
                        contact.department
                      ].filter(Boolean).join(" / ")
                    }))}
                  />
                </Form.Item>
                <Form.Item name="department" label="使用部门">
                  <Input maxLength={100} placeholder="例如 销售部、行政部" />
                </Form.Item>
              </div>
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
            </Form>
          </Drawer>

          <Drawer
            open={Boolean(lifecycleVehicle)}
            title={lifecycleVehicle?.status === "ACTIVE" ? "停用车辆" : "启用车辆"}
            onClose={() => {
              setLifecycleVehicle(null);
              vehicleLifecycleForm.resetFields();
            }}
            placement="right"
            destroyOnHidden
            footer={(
              <div className="customer-detail-drawer-footer">
                <Button onClick={() => setLifecycleVehicle(null)}>取消</Button>
                <Button
                  type="primary"
                  danger={lifecycleVehicle?.status === "ACTIVE"}
                  loading={lifecycleMutation.isPending}
                  onClick={submitVehicleLifecycle}
                >
                  确认{lifecycleVehicle?.status === "ACTIVE" ? "停用" : "启用"}
                </Button>
              </div>
            )}
          >
            <Typography.Paragraph type="secondary">
              {lifecycleVehicle?.status === "ACTIVE"
                ? "停用后该车辆不能用于新订单，历史订单、质保和售后记录仍保留。"
                : "启用前系统会再次校验本门店车牌号与 VIN 是否冲突。"}
            </Typography.Paragraph>
            <Form<VehicleLifecycleFormValues> form={vehicleLifecycleForm} layout="vertical">
              <Form.Item
                name="reason"
                label={lifecycleVehicle?.status === "ACTIVE" ? "停用原因" : "启用原因"}
                rules={[{ required: true, whitespace: true, message: "请填写操作原因" }]}
              >
                <Input.TextArea rows={4} maxLength={200} showCount />
              </Form.Item>
            </Form>
          </Drawer>

          <Drawer
            open={Boolean(transferVehicle)}
            title="转移车辆归属"
            onClose={() => {
              setTransferVehicle(null);
              vehicleTransferForm.resetFields();
            }}
            placement="right"
            destroyOnHidden
            footer={(
              <div className="customer-detail-drawer-footer">
                <Button onClick={() => setTransferVehicle(null)}>取消</Button>
                <Button type="primary" loading={transferMutation.isPending} onClick={submitVehicleTransfer}>
                  确认转移
                </Button>
              </div>
            )}
          >
            <Typography.Paragraph type="secondary">
              转移仅变更车辆当前归属客户；历史订单、质保和售后仍保留原记录，并写入车辆归属审计。
            </Typography.Paragraph>
            <Form<VehicleTransferFormValues> form={vehicleTransferForm} layout="vertical">
              <Form.Item
                name="toCustomerId"
                label="目标客户"
                rules={[{ required: true, message: "请选择目标客户" }]}
              >
                <Select
                  showSearch
                  loading={transferTargetsQuery.isLoading}
                  placeholder="搜索并选择本门店客户"
                  optionFilterProp="label"
                  options={((transferTargetsQuery.data?.items ?? []) as CustomerListItem[])
                    .filter((item) => item.id !== customerId)
                    .map((item) => ({ value: item.id, label: getCustomerListItemName(item) }))}
                />
              </Form.Item>
              <Form.Item
                name="reason"
                label="转移原因"
                rules={[{ required: true, whitespace: true, message: "请填写转移原因" }]}
              >
                <Input.TextArea rows={4} maxLength={200} showCount />
              </Form.Item>
            </Form>
          </Drawer>

          <Drawer
            open={Boolean(historyVehicle)}
            title={`${historyVehicle?.carPlate ?? historyVehicle?.carModel ?? "车辆"} · 变更历史`}
            onClose={() => setHistoryVehicle(null)}
            placement="right"
            width={520}
            destroyOnHidden
          >
            {vehicleHistoryQuery.isLoading ? <Skeleton active /> : (
              <div className="space-y-3">
                {(vehicleHistoryQuery.data ?? []).map((item) => (
                  <Card key={item.id} size="small">
                    <div className="flex items-center justify-between gap-3">
                      <Typography.Text strong>{vehicleHistoryActionLabels[item.action]}</Typography.Text>
                      <Typography.Text type="secondary">{formatDateTime(item.operatedAt)}</Typography.Text>
                    </div>
                    {item.action === "TRANSFER" ? (
                      <Typography.Paragraph className="!mb-1 !mt-2">
                        {getCustomerListItemName(item.fromCustomer)} → {getCustomerListItemName(item.toCustomer)}
                      </Typography.Paragraph>
                    ) : null}
                    <Typography.Paragraph type="secondary" className="!mb-0">
                      {item.reason ? `原因：${item.reason}；` : ""}
                      操作人：{item.operatedBy.nickname ?? item.operatedBy.username}
                    </Typography.Paragraph>
                  </Card>
                ))}
                {(vehicleHistoryQuery.data ?? []).length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无车辆变更历史" />
                ) : null}
              </div>
            )}
          </Drawer>
        </>
      )}
    </div>
  );
}

function getCustomerListItemName(customer?: CustomerListItem | null) {
  if (!customer) return "原客户未记录";
  return customer.companyName ?? customer.name ?? customer.contactPerson ?? "未命名客户";
}

function getCustomerDisplayName(customer: CustomerDetail) {
  return customer.companyName ?? customer.name ?? customer.contactPerson ?? "客户详情";
}

function getCustomerInitial(customer: CustomerDetail) {
  return getCustomerDisplayName(customer).slice(0, 1).toUpperCase();
}

function getPrimaryVehicleLabel(customer: CustomerDetail) {
  const vehicle = customer.vehicles?.[0];
  if (!vehicle) return "暂无车辆";
  return [vehicle.carPlate, vehicle.carModel, vehicle.carColor].filter(Boolean).join(" / ");
}

function ProfileNoteBlock({
  title,
  emptyText,
  notes
}: {
  title: string;
  emptyText: string;
  notes: CustomerNote[];
}) {
  return (
    <div className="operation-queue-item">
      <Typography.Text strong>{title}</Typography.Text>
      <div className="mt-2 space-y-2">
        {notes.slice(0, 3).map((note) => (
          <div key={note.id}>
            <Typography.Text type="secondary" className="text-xs">
              {formatDateTime(note.createdAt)}
            </Typography.Text>
            <Typography.Paragraph className="!mb-0">{note.content}</Typography.Paragraph>
          </div>
        ))}
        {notes.length === 0 ? <Typography.Text type="secondary">{emptyText}</Typography.Text> : null}
      </div>
    </div>
  );
}

function StatisticLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-4 last:mb-0">
      <Typography.Text type="secondary">{label}</Typography.Text>
      <Typography.Text strong>{value}</Typography.Text>
    </div>
  );
}

function compactPayload<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== "")
  ) as T;
}

function toDateInputValue(value?: string | null) {
  if (!value) return undefined;
  return value.slice(0, 10);
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium" }).format(new Date(value));
}

function formatDateTime(value?: string | Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatCurrency(value?: number | null) {
  const amount = (value ?? 0) / 100;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0
  }).format(amount);
}
