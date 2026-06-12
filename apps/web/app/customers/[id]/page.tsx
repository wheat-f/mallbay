"use client";

import {
  App,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Layout,
  List,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
  Typography
} from "antd";
import {
  CarOutlined,
  EditOutlined,
  FileTextOutlined,
  PlusOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { customerApi } from "../../../src/lib/api";
import type {
  CreateCustomerNotePayload,
  CreateCustomerPayload,
  CreateCustomerTagPayload,
  CreateVehiclePayload
} from "../../../src/features/customers/api";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import {
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel,
  getCustomerConsumptionTrendRows,
  getCustomerProfileNotes,
  getWarrantyStatusLabel
} from "../../../src/features/customers/display";
import {
  CONSTRUCTION_TYPE_LABEL,
  getOrderStatusLabel
} from "../../../src/features/orders/order-display";

type CustomerDetail = {
  id: string;
  storeId: string;
  customerType: "PERSONAL" | "COMPANY";
  name?: string | null;
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
  vehicles?: CustomerVehicle[];
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
  systemTags: Array<{ code: string; label: string }>;
};

type EditCustomerFormValues = Partial<CreateCustomerPayload>;
type VehicleFormValues = Omit<CreateVehiclePayload, "customerId">;
type NoteFormValues = Pick<CreateCustomerNotePayload, "content" | "noteType">;
type TagFormValues = Pick<CreateCustomerTagPayload, "label">;

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

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [editForm] = Form.useForm<EditCustomerFormValues>();
  const [vehicleForm] = Form.useForm<VehicleFormValues>();
  const [noteForm] = Form.useForm<NoteFormValues>();
  const [tagForm] = Form.useForm<TagFormValues>();
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
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const vehicleMutation = useMutation({
    mutationFn: (values: VehicleFormValues) =>
      customerApi.createVehicle(compactPayload({ ...values, customerId }) as CreateVehiclePayload),
    onSuccess: () => {
      message.success("车辆已添加");
      vehicleForm.resetFields();
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

  const openEditModal = () => {
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
    Modal.confirm({
      title: "编辑基础信息",
      width: 640,
      okText: "保存",
      cancelText: "取消",
      content: (
        <Form<EditCustomerFormValues> form={editForm} layout="vertical" className="mt-4">
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
      ),
      onOk: async () => {
        const values = await editForm.validateFields();
        await updateMutation.mutateAsync(values);
      }
    });
  };

  const openVehicleModal = () => {
    vehicleForm.resetFields();
    Modal.confirm({
      title: "新增车辆",
      width: 560,
      okText: "保存",
      cancelText: "取消",
      content: (
        <Form<VehicleFormValues> form={vehicleForm} layout="vertical" className="mt-4">
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
          <Form.Item name="photoUrl" label="车辆照片 URL">
            <Input placeholder="可粘贴已上传的车辆照片地址" />
          </Form.Item>
        </Form>
      ),
      onOk: async () => {
        const values = await vehicleForm.validateFields();
        await vehicleMutation.mutateAsync(values);
      }
    });
  };

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <StorePageHeader
          title={customer?.companyName ?? customer?.name ?? "客户详情"}
          description="客户档案、车辆、订单与跟进记录"
        >
            <Button icon={<EditOutlined />} disabled={!customer} onClick={openEditModal}>
              编辑信息
            </Button>
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              disabled={!customer}
              onClick={() => router.push(`/orders/create?customerId=${customerId}`)}
            >
              新建订单
            </Button>
        </StorePageHeader>

        {customerQuery.isLoading ? (
          <Skeleton active />
        ) : !customer ? (
          <Empty description="客户不存在或无权访问" />
        ) : (
          <div className="space-y-4">
            <Card>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Tag>{customer.customerType === "COMPANY" ? "企业客户" : "个人客户"}</Tag>
                {(summary?.systemTags ?? []).map((tag) => (
                  <Tag key={tag.code} color={tag.code === "KEY_FOLLOW_UP" ? "red" : "blue"}>
                    {tag.label}
                  </Tag>
                ))}
              </div>
              <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }}>
                <Descriptions.Item label="联系人">
                  {customer.contactPerson ?? customer.name ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="性别">
                  {customer.gender ? genderLabels[customer.gender] ?? customer.gender : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="生日">
                  {formatDate(customer.birthday)}
                </Descriptions.Item>
                <Descriptions.Item label="微信">{customer.wechat ?? "-"}</Descriptions.Item>
                <Descriptions.Item label="来源">
                  {customer.sourceType ? sourceLabels[customer.sourceType] ?? customer.sourceType : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="归属销售">
                  {customer.owner?.nickname ?? customer.owner?.username ?? "-"}
                </Descriptions.Item>
                <Descriptions.Item label="介绍人">
                  {customer.referrer
                    ? customer.referrer.companyName ?? customer.referrer.name ?? customer.referrer.contactPerson
                    : "-"}
                </Descriptions.Item>
                <Descriptions.Item label="来源说明" span={3}>
                  {customer.sourceDetail ?? "-"}
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              <Card title="消费情况">
                <StatisticLine label="消费次数" value={`${summary?.consumption.orderCount ?? 0} 次`} />
                <StatisticLine
                  label="消费金额"
                  value={formatCurrency(summary?.consumption.totalAmountCents)}
                />
                <StatisticLine
                  label="待收金额"
                  value={formatCurrency(summary?.consumption.outstandingCents)}
                />
                <StatisticLine
                  label="消费类别"
                  value={formatDistribution(
                    summary?.consumption.constructionTypeDistribution,
                    CONSTRUCTION_TYPE_LABEL
                  )}
                />
                <StatisticLine
                  label="最近消费"
                  value={formatDate(summary?.consumption.latestConsumedAt)}
                />
              </Card>
              <Card title="消费趋势">
                {consumptionTrendRows.length > 0 ? (
                  <div className="space-y-3">
                    {consumptionTrendRows.map((row) => (
                      <div key={row.month}>
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <Typography.Text strong>{row.month}</Typography.Text>
                          <Typography.Text>{row.totalAmountLabel}</Typography.Text>
                        </div>
                        <div className="h-2 overflow-hidden rounded bg-gray-100">
                          <div
                            className="h-full rounded bg-blue-500"
                            style={{ width: `${row.percentOfMax}%` }}
                          />
                        </div>
                        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                          <span>{row.orderCountLabel}</span>
                          <span>已收 {row.paidAmountLabel}</span>
                          <span>待收 {row.outstandingAmountLabel}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无消费趋势" />
                )}
              </Card>
              <Card title="质保情况">
                <StatisticLine label="有效质保" value={`${summary?.warranty.activeCount ?? 0} 个`} />
                <StatisticLine label="已过期" value={`${summary?.warranty.expiredCount ?? 0} 个`} />
                <StatisticLine
                  label="30 天内到期"
                  value={`${summary?.warranty.expiringSoonCount ?? 0} 个`}
                />
                <StatisticLine label="最近到期" value={formatDate(summary?.warranty.latestEndDate)} />
              </Card>
              <Card title="售后情况">
                <StatisticLine label="售后次数" value={`${summary?.afterSales.totalCount ?? 0} 次`} />
                <StatisticLine label="未关闭" value={`${summary?.afterSales.openCount ?? 0} 次`} />
                <StatisticLine label="已关闭" value={`${summary?.afterSales.closedCount ?? 0} 次`} />
                <StatisticLine
                  label="责任分布"
                  value={formatDistribution(summary?.afterSales.responsibilityDistribution)}
                />
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card title="客户画像">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <ProfileNoteBlock
                    title="客户偏好"
                    emptyText="暂无客户偏好"
                    notes={profileNotes.preferences}
                  />
                  <ProfileNoteBlock
                    title="特殊要求"
                    emptyText="暂无特殊要求"
                    notes={profileNotes.requirements}
                  />
                </div>
              </Card>

              <Card
                title="车辆信息"
                extra={
                  <Button size="small" icon={<PlusOutlined />} onClick={openVehicleModal}>
                    新增车辆
                  </Button>
                }
              >
                <List
                  dataSource={customer.vehicles ?? []}
                  locale={{ emptyText: "暂无车辆" }}
                  renderItem={(vehicle) => (
                    <List.Item>
                      <List.Item.Meta
                        avatar={<CarOutlined className="text-lg text-blue-500" />}
                        title={vehicle.carPlate ?? vehicle.carModel}
                        description={`${vehicle.carModel}${vehicle.carColor ? ` / ${vehicle.carColor}` : ""}`}
                      />
                      {vehicle.photoUrl ? (
                        <img
                          alt={`${vehicle.carModel} 车辆照片`}
                          className="h-16 w-20 rounded object-cover"
                          src={vehicle.photoUrl}
                        />
                      ) : null}
                    </List.Item>
                  )}
                />
              </Card>

              <Card title="客户标签">
                <div className="mb-4 flex flex-wrap gap-2">
                  {(customer.tags ?? []).map((tag) => (
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
                  {(customer.tags ?? []).length === 0 ? (
                    <Typography.Text type="secondary">暂无自定义标签</Typography.Text>
                  ) : null}
                </div>
                <Form<TagFormValues>
                  form={tagForm}
                  layout="inline"
                  onFinish={(values) => tagMutation.mutate(values)}
                >
                  <Form.Item
                    name="label"
                    rules={[{ required: true, whitespace: true, message: "请输入标签" }]}
                  >
                    <Input maxLength={30} placeholder="例如 老客户、商务车队" />
                  </Form.Item>
                  <Button htmlType="submit" loading={tagMutation.isPending}>
                    添加标签
                  </Button>
                </Form>
              </Card>

              <Card title="沟通记录">
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
                  <Form.Item
                    name="content"
                    rules={[{ required: true, whitespace: true, message: "请输入跟进内容" }]}
                  >
                    <Input.TextArea rows={3} maxLength={1000} placeholder="记录偏好、特殊要求或沟通内容" />
                  </Form.Item>
                  <Button type="primary" htmlType="submit" loading={noteMutation.isPending}>
                    添加记录
                  </Button>
                </Form>
                <List
                  className="mt-4"
                  dataSource={profileNotes.communications}
                  locale={{ emptyText: "暂无沟通记录" }}
                  renderItem={(note) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Space>
                            <Tag>{noteTypeLabels[note.noteType ?? "COMMUNICATION"] ?? "沟通记录"}</Tag>
                            <span>{formatDateTime(note.createdAt)}</span>
                          </Space>
                        }
                        description={note.content}
                      />
                    </List.Item>
                  )}
                />
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <Card title="质保记录">
                <Table<CustomerWarranty>
                  rowKey="id"
                  pagination={false}
                  dataSource={customer.warranties ?? []}
                  locale={{ emptyText: "暂无质保记录" }}
                  columns={[
                    { title: "质保编号", render: (_, warranty) => warranty.warrantyNo ?? warranty.id },
                    {
                      title: "状态",
                      render: (_, warranty) => <Tag>{getWarrantyStatusLabel(warranty.status)}</Tag>
                    },
                    { title: "开始日期", render: (_, warranty) => formatDate(warranty.startDate) },
                    { title: "到期日期", render: (_, warranty) => formatDate(warranty.endDate) }
                  ]}
                />
              </Card>

              <Card title="售后记录">
                <Table<CustomerAfterSale>
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
                    { title: "问题类型", render: (_, afterSale) => afterSale.issueType ?? "-" },
                    { title: "创建时间", render: (_, afterSale) => formatDateTime(afterSale.createdAt) }
                  ]}
                />
              </Card>
            </div>

            <Card title="最近订单">
              <Table<CustomerOrder>
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
                    render: (_, order) => (
                      <Tag>{getOrderStatusLabel(order.status)}</Tag>
                    )
                  },
                  {
                    title: "金额",
                    render: (_, order) => formatCurrency(order.amount?.totalAmountCents)
                  },
                  {
                    title: "创建时间",
                    render: (_, order) => formatDateTime(order.createdAt)
                  }
                ]}
              />
            </Card>
          </div>
        )}
      </Layout.Content>
    </Layout>
  );
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
    <div>
      <Typography.Text strong>{title}</Typography.Text>
      <List
        className="mt-2"
        size="small"
        dataSource={notes.slice(0, 3)}
        locale={{ emptyText }}
        renderItem={(note) => (
          <List.Item>
            <List.Item.Meta
              title={formatDateTime(note.createdAt)}
              description={note.content}
            />
          </List.Item>
        )}
      />
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

function formatDistribution(distribution?: Record<string, number>, labels: Record<string, string> = {}) {
  const entries = Object.entries(distribution ?? {});
  if (entries.length === 0) return "-";
  return entries.map(([key, value]) => `${labels[key] ?? key}: ${value}`).join(" / ");
}
