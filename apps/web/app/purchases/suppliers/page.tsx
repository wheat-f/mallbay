"use client";

import type { InventorySupplierSummary } from "@mallbay/shared";
import type {
  CreateSupplierContactPayload,
  CreateSupplierPayload,
  CreateSupplierRatingHistoryPayload,
  UpdateSupplierPayload
} from "../../../src/lib/api";
import {
  App,
  Alert,
  Button,
  Card,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Select,
  Switch,
  Table,
  Tabs,
  Tag
} from "antd";
import {
  DownloadOutlined,
  EditOutlined,
  MoreOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
  StarFilled,
  TeamOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { purchaseApi } from "../../../src/lib/api";
import { PurchaseModuleNav } from "../../../src/features/purchases/purchase-module-nav";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type SupplierFormValues = Omit<CreateSupplierPayload, "storeId">;
type SupplierStatusFilter = "ALL" | "ACTIVE" | "INACTIVE" | "PENDING";

export default function InventorySuppliersPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManagePurchase = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";
  const [supplierForm] = Form.useForm<SupplierFormValues>();
  const [editForm] = Form.useForm<UpdateSupplierPayload>();
  const [contactForm] = Form.useForm<CreateSupplierContactPayload>();
  const [ratingForm] = Form.useForm<CreateSupplierRatingHistoryPayload>();
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<SupplierStatusFilter>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>();
  const [createOpen, setCreateOpen] = useState(false);

  const suppliersQuery = useQuery({
    queryKey: ["purchase-suppliers", storeId],
    queryFn: () => purchaseApi.suppliers(storeId!),
    enabled: Boolean(storeId)
  });

  const suppliers = useMemo(() => suppliersQuery.data ?? [], [suppliersQuery.data]);
  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter((supplier) => {
        const keywordMatched = [supplier.name, supplier.contactName, supplier.contactPhone, supplier.note]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(keyword.trim().toLowerCase());
        const statusMatched =
          statusFilter === "PENDING"
            ? false
            : statusFilter === "ALL" ||
              (statusFilter === "ACTIVE" && supplier.isActive !== false) ||
              (statusFilter === "INACTIVE" && supplier.isActive === false);
        const categoryMatched = categoryFilter === "ALL" || (supplier.note ?? "").includes(categoryFilter);
        return keywordMatched && statusMatched && categoryMatched;
      }),
    [categoryFilter, keyword, statusFilter, suppliers]
  );
  const activeSupplierId = selectedSupplierId ?? filteredSuppliers[0]?.id;
  const selectedSupplier = filteredSuppliers.find((supplier) => supplier.id === activeSupplierId);
  const supplierMetrics = {
    active: suppliers.filter((supplier) => supplier.isActive !== false).length,
    onTimeDeliveryRate: "98.5%",
    averagePurchaseCycle: "4.2 天"
  };

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["purchase-suppliers", storeId] });
  const createSupplier = useMutation({
    mutationFn: (values: SupplierFormValues) => purchaseApi.createSupplier({ ...values, storeId: storeId! }),
    onSuccess: async (created) => {
      message.success("供应商已新增");
      supplierForm.resetFields();
      setCreateOpen(false);
      setSelectedSupplierId(created.id);
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const updateSupplier = useMutation({
    mutationFn: (values: UpdateSupplierPayload) => {
      if (!selectedSupplier?.id) throw new Error("请先选择供应商");
      return purchaseApi.updateSupplier(selectedSupplier.id, values);
    },
    onSuccess: async () => {
      message.success("供应商资料已更新");
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const createSupplierContact = useMutation({
    mutationFn: (values: CreateSupplierContactPayload) => {
      if (!selectedSupplier?.id) throw new Error("请先选择供应商");
      return purchaseApi.createSupplierContact(selectedSupplier.id, values);
    },
    onSuccess: async () => {
      message.success("联系人已新增");
      contactForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });
  const createSupplierRatingHistory = useMutation({
    mutationFn: (values: CreateSupplierRatingHistoryPayload) => {
      if (!selectedSupplier?.id) throw new Error("请先选择供应商");
      return purchaseApi.createSupplierRatingHistory(selectedSupplier.id, values);
    },
    onSuccess: async () => {
      message.success("评级记录已追加");
      ratingForm.resetFields();
      await invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const handleSelectSupplier = (supplier: InventorySupplierSummary) => {
    setSelectedSupplierId(supplier.id);
    editForm.setFieldsValue({
      name: supplier.name,
      contactName: supplier.contactName ?? undefined,
      contactPhone: supplier.contactPhone ?? undefined,
      rating: supplier.rating ?? undefined,
      note: supplier.note ?? undefined,
      isActive: supplier.isActive !== false
    });
  };

  return (
    <div className="management-page supplier-archive-page">
      <StorePageHeader title="供应商管理" description="维护供应商档案、联系人、评级历史与批次合作记录" />
      {!canManagePurchase ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          message="只读模式"
          description="客服可查看供应商、采购单和批次合作记录，不能新增、编辑、维护联系人或评级。"
        />
      ) : null}

      <div className="purchase-module-layout">
        <PurchaseModuleNav activeKey="suppliers" />
        <div className="purchase-module-content">
          <div className="supplier-command-bar">
            <Button
              type="primary"
              icon={<PlusOutlined />}
              disabled={!storeId || !canManagePurchase}
              onClick={() => setCreateOpen(true)}
            >
              新增供应商
            </Button>
            <Button icon={<DownloadOutlined />}>导出列表</Button>
          </div>

          <div className="supplier-filter-row">
            <Input
              allowClear
              value={keyword}
              placeholder="搜索供应商、联系人或分类..."
              onChange={(event) => setKeyword(event.target.value)}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "ALL", label: "全部状态" },
                { value: "ACTIVE", label: "合作中" },
                { value: "INACTIVE", label: "已暂停" },
                { value: "PENDING", label: "审核中" }
              ]}
            />
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={[
                { value: "ALL", label: "所有分类" },
                { value: "TPU", label: "TPU基材" },
                { value: "胶", label: "背胶材料" },
                { value: "膜", label: "高端原膜" },
                { value: "辅料", label: "辅料耗材" }
              ]}
            />
          </div>

          <section className="supplier-workspace">
            <div className="supplier-main-stack">
              <Card className="supplier-table-card">
            <div className="supplier-mobile-cards">
              {filteredSuppliers.length > 0 ? (
                filteredSuppliers.map((supplier) => (
                  <button
                    className={`supplier-mobile-card${supplier.id === selectedSupplier?.id ? " is-active" : ""}`}
                    key={supplier.id ?? supplier.name}
                    type="button"
                    onClick={() => handleSelectSupplier(supplier)}
                  >
                    <div className="supplier-mobile-card-head">
                      <span>{supplier.name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{supplier.name}</strong>
                        <small>主营：{getSupplierCategory(supplier)}</small>
                      </div>
                      <Tag color={supplier.isActive === false ? "error" : "success"}>
                        {supplier.isActive === false ? "已暂停" : "合作中"}
                      </Tag>
                    </div>
                    <dl className="supplier-mobile-card-fields">
                      <div>
                        <dt>主要品类</dt>
                        <dd>{getSupplierCategory(supplier)}</dd>
                      </div>
                      <div>
                        <dt>联系人</dt>
                        <dd>{supplier.contactName ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>联系电话</dt>
                        <dd>{supplier.contactPhone ?? "-"}</dd>
                      </div>
                      <div>
                        <dt>评分</dt>
                        <dd><SupplierRating value={supplier.rating} /></dd>
                      </div>
                    </dl>
                  </button>
                ))
              ) : (
                <div className="supplier-mobile-empty">暂无供应商档案</div>
              )}
            </div>
            <Table<InventorySupplierSummary>
              className="supplier-desktop-table"
              rowKey={(row) => row.id ?? row.name}
              loading={suppliersQuery.isLoading}
              dataSource={filteredSuppliers}
              pagination={{ pageSize: 6 }}
              scroll={{ x: 940 }}
              onRow={(row) => ({ onClick: () => handleSelectSupplier(row) })}
              rowClassName={(row) => (row.id === selectedSupplier?.id ? "supplier-selected-row" : "")}
              columns={[
                {
                  title: "供应商名称",
                  width: 260,
                  render: (_, row) => (
                    <div className="supplier-name-cell">
                      <span>{row.name.slice(0, 1).toUpperCase()}</span>
                      <div>
                        <strong>{row.name}</strong>
                        <small>主营：{getSupplierCategory(row)}</small>
                      </div>
                    </div>
                  )
                },
                { title: "主要品类", width: 120, render: (_, row) => <Tag>{getSupplierCategory(row)}</Tag> },
                { title: "联系人", width: 120, render: (_, row) => row.contactName ?? "-" },
                { title: "联系电话", width: 140, render: (_, row) => row.contactPhone ?? "-" },
                { title: "评分", width: 120, render: (_, row) => <SupplierRating value={row.rating} /> },
                {
                  title: "状态",
                  width: 100,
                  render: (_, row) => <Tag color={row.isActive === false ? "error" : "success"}>{row.isActive === false ? "已暂停" : "合作中"}</Tag>
                },
                { title: "操作", width: 80, render: () => <Button type="text" icon={<MoreOutlined />} /> }
              ]}
            />
              </Card>

              <div className="supplier-metric-grid">
                <Card className="supplier-metric-card">
                  <TeamOutlined />
                  <span>活跃供应商</span>
                  <strong>{supplierMetrics.active}</strong>
                </Card>
                <Card className="supplier-metric-card">
                  <SafetyCertificateOutlined />
                  <span>月度准时交付率</span>
                  <strong>{supplierMetrics.onTimeDeliveryRate}</strong>
                </Card>
                <Card className="supplier-metric-card">
                  <StarFilled />
                  <span>平均采购周期</span>
                  <strong>{supplierMetrics.averagePurchaseCycle}</strong>
                </Card>
              </div>
            </div>

            <aside className="supplier-detail-drawer">
          {selectedSupplier ? (
            <>
              <div className="supplier-detail-head">
                <span>{selectedSupplier.name.slice(0, 1).toUpperCase()}</span>
                <div>
                  <h2>{selectedSupplier.name}</h2>
                  <p>最后更新于 {formatDate(selectedSupplier.lastMasterDataUpdatedAt)}</p>
                </div>
              </div>

              <Tabs
                defaultActiveKey="basic"
                items={[
                  {
                    key: "basic",
                    label: "基本信息",
                    children: (
                      <div className="supplier-detail-panel">
                        <Form
                          form={editForm}
                          layout="vertical"
                          initialValues={{
                            name: selectedSupplier.name,
                            contactName: selectedSupplier.contactName,
                            contactPhone: selectedSupplier.contactPhone,
                            rating: selectedSupplier.rating,
                            note: selectedSupplier.note,
                            isActive: selectedSupplier.isActive !== false
                          }}
                          onFinish={(values) => updateSupplier.mutate(values)}
                        >
                          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: "请输入供应商名称" }]}>
                            <Input />
                          </Form.Item>
                          <Form.Item name="contactName" label="主要联系人">
                            <Input />
                          </Form.Item>
                          <Form.Item name="contactPhone" label="商务电话">
                            <Input />
                          </Form.Item>
                          <Form.Item name="rating" label="当前评分">
                            <InputNumber min={1} max={5} />
                          </Form.Item>
                          <Form.Item name="note" label="分类/备注">
                            <Input.TextArea rows={3} />
                          </Form.Item>
                          <Form.Item name="isActive" label="启用状态" valuePropName="checked">
                          <Switch checkedChildren="合作中" unCheckedChildren="暂停" disabled={!canManagePurchase} />
                          </Form.Item>
                          <Button type="primary" htmlType="submit" icon={<EditOutlined />} loading={updateSupplier.isPending} disabled={!canManagePurchase} block>
                            编辑详情
                          </Button>
                        </Form>

                        <Card className="supplier-contact-card" title="核心联系信息">
                          <dl>
                            <dt>主要联系人</dt>
                            <dd>{selectedSupplier.contactName ?? "-"}</dd>
                            <dt>商务电话</dt>
                            <dd>{selectedSupplier.contactPhone ?? "-"}</dd>
                            <dt>结算周期</dt>
                            <dd>月结（Net 30）</dd>
                          </dl>
                        </Card>
                      </div>
                    )
                  },
                  {
                    key: "batches",
                    label: "批次历史",
                    children: (
                      <div className="supplier-detail-panel">
                        <Card className="supplier-batch-card">
                          <div className="supplier-batch-row">
                            <strong>采购单</strong>
                            <span>{selectedSupplier.purchaseOrderCount} 单</span>
                          </div>
                          <div className="supplier-batch-row">
                            <strong>入库批次</strong>
                            <span>{selectedSupplier.batchCount} 批</span>
                          </div>
                          <div className="supplier-batch-row">
                            <strong>最近采购</strong>
                            <span>{formatDate(selectedSupplier.lastPurchaseOrderAt)}</span>
                          </div>
                          <div className="supplier-batch-row">
                            <strong>最近入库</strong>
                            <span>{formatDate(selectedSupplier.lastBatchUpdatedAt)}</span>
                          </div>
                        </Card>

                        <Form
                          form={contactForm}
                          layout="inline"
                          className="supplier-inline-form"
                          onFinish={(values) => createSupplierContact.mutate(values)}
                        >
                          <Form.Item name="name" rules={[{ required: true, message: "请输入联系人" }]}>
                            <Input placeholder="联系人" />
                          </Form.Item>
                          <Form.Item name="phone">
                            <Input placeholder="电话" />
                          </Form.Item>
                          <Form.Item name="role">
                            <Input placeholder="角色" />
                          </Form.Item>
                          <Button htmlType="submit" loading={createSupplierContact.isPending} disabled={!canManagePurchase}>
                            新增联系人
                          </Button>
                        </Form>
                      </div>
                    )
                  },
                  {
                    key: "audit",
                    label: "审计日志",
                    children: (
                      <div className="supplier-detail-panel">
                        <div className="supplier-audit-timeline">
                          {(selectedSupplier.ratingHistory ?? []).map((history) => (
                            <div key={history.id}>
                              <i />
                              <div>
                                <strong>{history.rating} 星评级记录</strong>
                                <span>{formatDate(history.createdAt)}</span>
                                <p>{history.note ?? "无备注"}</p>
                              </div>
                            </div>
                          ))}
                          {(selectedSupplier.ratingHistory?.length ?? 0) === 0 ? <Empty description="暂无审计日志" /> : null}
                        </div>
                        <Form
                          form={ratingForm}
                          layout="inline"
                          className="supplier-inline-form"
                          onFinish={(values) => createSupplierRatingHistory.mutate(values)}
                        >
                          <Form.Item name="rating" rules={[{ required: true, message: "请输入评级" }]}>
                            <InputNumber min={1} max={5} placeholder="评分" />
                          </Form.Item>
                          <Form.Item name="note">
                            <Input placeholder="评级说明" />
                          </Form.Item>
                          <Button htmlType="submit" loading={createSupplierRatingHistory.isPending} disabled={!canManagePurchase}>
                            追加评级
                          </Button>
                        </Form>
                      </div>
                    )
                  }
                ]}
              />
            </>
          ) : (
            <Empty description="暂无供应商档案" />
          )}
            </aside>
          </section>
        </div>
      </div>

      <Drawer
        className="supplier-create-drawer"
        open={createOpen}
        title="新增供应商"
        onClose={() => setCreateOpen(false)}
        destroyOnHidden
        footer={
          <div className="supplier-create-drawer-footer">
            <Button onClick={() => setCreateOpen(false)}>取消</Button>
            <Button type="primary" loading={createSupplier.isPending} disabled={!canManagePurchase} onClick={() => supplierForm.submit()}>
              保存供应商
            </Button>
          </div>
        }
      >
        <Form
          form={supplierForm}
          layout="vertical"
          onFinish={(values) => createSupplier.mutate(values)}
        >
          <Form.Item name="name" label="供应商名称" rules={[{ required: true, message: "请输入供应商名称" }]}>
            <Input placeholder="例如：威固中国供应链" />
          </Form.Item>
          <Form.Item name="contactName" label="联系人">
            <Input placeholder="联系人姓名" />
          </Form.Item>
          <Form.Item name="contactPhone" label="联系电话">
            <Input placeholder="商务电话" />
          </Form.Item>
          <Form.Item name="rating" label="初始评分">
            <InputNumber className="w-full" min={1} max={5} />
          </Form.Item>
          <Form.Item name="note" label="分类/备注">
            <Input.TextArea rows={4} placeholder="可记录主营品类、结算周期或合作说明" />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
}

function SupplierRating({ value }: { value?: number | null }) {
  const normalized = Math.max(0, Math.min(5, Number(value ?? 0)));
  return (
    <span className="supplier-rating" aria-label={`${normalized} 星`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <StarFilled key={index} className={index < normalized ? "is-active" : ""} />
      ))}
    </span>
  );
}

function getSupplierCategory(supplier: InventorySupplierSummary) {
  if (supplier.note?.includes("TPU")) return "TPU基材";
  if (supplier.note?.includes("胶")) return "背胶材料";
  if (supplier.note?.includes("辅料")) return "辅料耗材";
  return "高端原膜";
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "-";
  return date.toISOString().slice(0, 10);
}
