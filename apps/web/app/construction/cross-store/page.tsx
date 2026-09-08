"use client";

import { useMemo, useState } from "react";
import { App, Alert, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tabs, Tag, Typography } from "antd";
import { CheckOutlined, CloseOutlined, LinkOutlined, PlusOutlined, StopOutlined } from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { constructionApi, productApi, storeApi } from "../../../src/lib/api";
import { clearLifecycleCommandId, getLifecycleCommandId } from "../../../src/features/construction/api";
import type { CrossStoreProductMapping, CrossStoreTask, CrossStoreTaskScope, CrossStoreTaskStatus } from "../../../src/features/construction/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../../../src/features/permissions/use-effective-permissions";

const statusLabels: Record<CrossStoreTaskStatus, string> = {
  PENDING_ACCEPTANCE: "待执行门店确认",
  REJECTED: "已拒绝",
  ACCEPTED: "已接受",
  READY_TO_DISPATCH: "待派工",
  DISPATCHED: "已派工",
  IN_CONSTRUCTION: "施工中",
  PENDING_SOURCE_ACCEPTANCE: "待来源门店验收",
  COMPLETED: "已完成",
  CANCELLED: "已取消"
};

const statusColors: Record<CrossStoreTaskStatus, string> = {
  PENDING_ACCEPTANCE: "gold",
  REJECTED: "red",
  ACCEPTED: "blue",
  READY_TO_DISPATCH: "geekblue",
  DISPATCHED: "cyan",
  IN_CONSTRUCTION: "processing",
  PENDING_SOURCE_ACCEPTANCE: "orange",
  COMPLETED: "green",
  CANCELLED: "default"
};

const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({ value, label }));

type ProductOption = {
  id: string;
  brand?: string;
  name?: string;
  model?: string;
  unit?: string;
  inventoryUnit?: string;
  salesUnit?: string;
};

type ActionModal = { kind: "reject" | "cancel" | "submit"; task: CrossStoreTask } | null;

function productLabel(product?: ProductOption) {
  if (!product) return "";
  return [product.brand, product.name, product.model].filter(Boolean).join(" / ") || product.id;
}

function customerLabel(task: CrossStoreTask) {
  return task.order.customer?.companyName || task.order.customer?.name || "未命名客户";
}

export default function CrossStoreConstructionPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const permissionsQuery = useEffectivePermissions(storeId);
  const canConfigureMappings = hasEffectivePermission(permissionsQuery.data?.permissions, "construction", "write", storeId);
  const [scope, setScope] = useState<CrossStoreTaskScope>("EXECUTION");
  const [status, setStatus] = useState<CrossStoreTaskStatus | undefined>();
  const [actionModal, setActionModal] = useState<ActionModal>(null);
  const [actionForm] = Form.useForm<{ reason: string }>();
  const [mappingStoreId, setMappingStoreId] = useState<string>();
  const [mappingForm] = Form.useForm<{ sourceProductId: string; executionProductId: string; sourceSalesUnit: string; executionInventoryUnit: string; factor: number }>();

  const tasksQuery = useQuery({
    queryKey: ["cross-store-tasks", storeId, scope, status],
    queryFn: () => constructionApi.crossStoreTasks({ storeId: storeId!, scope, status }),
    enabled: Boolean(storeId)
  });
  const eligibleStoresQuery = useQuery({
    queryKey: ["cross-store-eligible-stores", storeId],
    queryFn: () => storeApi.eligibleExecutionStores(storeId!),
    enabled: Boolean(storeId && canConfigureMappings)
  });
  const mappingStores = eligibleStoresQuery.data ?? [];
  const sourceProductsQuery = useQuery({
    queryKey: ["cross-store-source-products", storeId],
    queryFn: () => productApi.list({ storeId: storeId!, status: "ACTIVE", page: 1, pageSize: 200 }),
    enabled: Boolean(storeId && mappingStoreId)
  });
  const executionProductsQuery = useQuery({
    queryKey: ["cross-store-execution-products", mappingStoreId],
    queryFn: () => productApi.list({ storeId: mappingStoreId!, status: "ACTIVE", page: 1, pageSize: 200 }),
    enabled: Boolean(mappingStoreId)
  });
  const mappingsQuery = useQuery({
    queryKey: ["cross-store-product-mappings", storeId, mappingStoreId],
    queryFn: () => constructionApi.crossStoreProductMappings(storeId!, mappingStoreId!),
    enabled: Boolean(storeId && mappingStoreId)
  });

  const invalidateTasks = () => queryClient.invalidateQueries({ queryKey: ["cross-store-tasks", storeId] });
  const taskMutation = useMutation({
    mutationFn: async ({ kind, task, reason }: { kind: ActionModal extends infer _T ? "reject" | "cancel" | "submit" : never; task: CrossStoreTask; reason: string }) => {
      const command = { commandId: getLifecycleCommandId(user!.id, storeId!, task.id, kind), expectedVersion: task.order.lifecycleVersion };
      if (kind === "reject") return constructionApi.rejectCrossStoreTask(task, reason, command);
      if (kind === "cancel") return constructionApi.cancelCrossStoreTask(task, reason, command);
      return constructionApi.submitCrossStoreAcceptance(task, reason, command);
    },
    onSuccess: async (_result, variables) => {
      clearLifecycleCommandId(user!.id, storeId!, variables.task.id, variables.kind);
      setActionModal(null); actionForm.resetFields(); await invalidateTasks(); message.success("操作已提交");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const acceptMutation = useMutation({
    mutationFn: (task: CrossStoreTask) => constructionApi.acceptCrossStoreTask(task, { commandId: getLifecycleCommandId(user!.id, storeId!, task.id, "accept"), expectedVersion: task.order.lifecycleVersion }),
    onSuccess: async (_result, task) => {
      clearLifecycleCommandId(user!.id, storeId!, task.id, "accept");
      await invalidateTasks(); message.success("已接受协作任务");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const sourceAcceptMutation = useMutation({
    mutationFn: (task: CrossStoreTask) => constructionApi.acceptCrossStoreCompletion(task, { commandId: getLifecycleCommandId(user!.id, storeId!, task.id, "source-accept"), expectedVersion: task.order.lifecycleVersion }),
    onSuccess: async (_result, task) => {
      clearLifecycleCommandId(user!.id, storeId!, task.id, "source-accept");
      await invalidateTasks(); message.success("已完成来源门店验收");
    },
    onError: (error: Error) => message.error(error.message)
  });
  const mappingMutation = useMutation({
    mutationFn: (values: { sourceProductId: string; executionProductId: string; sourceSalesUnit: string; executionInventoryUnit: string; factor: number }) => {
      if (!mappingStoreId) throw new Error("请先选择执行门店");
      return constructionApi.upsertCrossStoreProductMapping({
        sourceProductId: values.sourceProductId,
        executionStoreId: mappingStoreId,
        executionProductId: values.executionProductId,
        sourceSalesUnit: values.sourceSalesUnit,
        executionInventoryUnit: values.executionInventoryUnit,
        conversionSnapshot: { executionQuantityPerSourceUnit: values.factor }
      });
    },
    onSuccess: async () => { mappingForm.resetFields(); await queryClient.invalidateQueries({ queryKey: ["cross-store-product-mappings", storeId, mappingStoreId] }); message.success("产品映射已保存"); },
    onError: (error: Error) => message.error(error.message)
  });

  const tasks = tasksQuery.data ?? [];
  const sourceProducts = (sourceProductsQuery.data?.items ?? []) as ProductOption[];
  const executionProducts = (executionProductsQuery.data?.items ?? []) as ProductOption[];
  const mappingRows = mappingsQuery.data ?? [];

  const columns = useMemo(() => [
    { title: "订单", key: "order", render: (_: unknown, task: CrossStoreTask) => <Space direction="vertical" size={0}><Button type="link" onClick={() => router.push(`/orders/${task.orderId}`)}>{task.order.orderNo}</Button><Typography.Text type="secondary">{customerLabel(task)}</Typography.Text></Space> },
    { title: "车辆", key: "vehicle", render: (_: unknown, task: CrossStoreTask) => task.order.vehicle ? `${task.order.vehicle.carPlate || "未上牌"} / ${task.order.vehicle.carModel || ""}` : "未填写" },
    { title: "门店流转", key: "stores", render: (_: unknown, task: CrossStoreTask) => <Space direction="vertical" size={0}><Typography.Text>{task.sourceStore.name} → {task.executionStore.name}</Typography.Text><Typography.Text type="secondary">材料由执行门店提供</Typography.Text></Space> },
    { title: "预约", key: "appointment", render: (_: unknown, task: CrossStoreTask) => `${task.order.appointmentDate || "未定"} ${task.order.appointmentTimeSlot || ""}` },
    { title: "订单金额", key: "amount", render: (_: unknown, task: CrossStoreTask) => task.order.amount ? `¥${(task.order.amount.totalAmountCents / 100).toFixed(2)}` : "—" },
    { title: "状态", key: "status", render: (_: unknown, task: CrossStoreTask) => <Tag color={statusColors[task.status]}>{statusLabels[task.status]}</Tag> },
    { title: "操作", key: "actions", render: (_: unknown, task: CrossStoreTask) => <Space wrap>
      {task.lifecycle?.capabilities.acceptCrossStore?.visible && <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!task.lifecycle.capabilities.acceptCrossStore.enabled} onClick={() => acceptMutation.mutate(task)}>接受</Button>}
      {task.lifecycle?.capabilities.rejectCrossStore?.visible && <Button size="small" danger icon={<CloseOutlined />} disabled={!task.lifecycle.capabilities.rejectCrossStore.enabled} onClick={() => { setActionModal({ kind: "reject", task }); actionForm.resetFields(); }}>拒绝</Button>}
      {task.lifecycle?.capabilities.cancelCrossStore?.visible && <Button size="small" danger icon={<StopOutlined />} disabled={!task.lifecycle.capabilities.cancelCrossStore.enabled} onClick={() => { setActionModal({ kind: "cancel", task }); actionForm.resetFields(); }}>取消协作</Button>}
      {task.lifecycle?.capabilities.submitCrossStoreAcceptance?.visible && <Button size="small" type="primary" disabled={!task.lifecycle.capabilities.submitCrossStoreAcceptance.enabled} onClick={() => { setActionModal({ kind: "submit", task }); actionForm.resetFields(); }}>提交施工验收</Button>}
      {task.lifecycle?.capabilities.acceptCrossStoreBySource?.visible && <Button size="small" type="primary" disabled={!task.lifecycle.capabilities.acceptCrossStoreBySource.enabled} onClick={() => sourceAcceptMutation.mutate(task)}>确认验收</Button>}
      <Button size="small" icon={<LinkOutlined />} onClick={() => router.push(`/orders/${task.orderId}`)}>查看订单</Button>
    </Space> }
  ], [acceptMutation, actionForm, router, sourceAcceptMutation]);

  const mappingColumns = [
    { title: "来源产品", key: "source", render: (_: unknown, row: CrossStoreProductMapping) => productLabel(row.sourceProduct) },
    { title: "执行门店产品", key: "execution", render: (_: unknown, row: CrossStoreProductMapping) => productLabel(row.executionProduct) },
    { title: "单位换算", key: "unit", render: (_: unknown, row: CrossStoreProductMapping) => `${row.sourceSalesUnit} → ${row.executionInventoryUnit}（${String(row.conversionSnapshot?.executionQuantityPerSourceUnit ?? 1)}）` }
  ];

  return <div className="management-page">
    <div className="page-header"><div><Typography.Title level={2}>跨门店施工协作</Typography.Title><Typography.Paragraph type="secondary">来源门店负责销售订单，执行门店负责施工、材料和现场记录；A/B/C 属于同一财务主体时可跨店协作。</Typography.Paragraph></div></div>
    <Alert type="info" showIcon title="协作规则" description="执行门店默认提供施工材料；当前阶段不收取门店间协作费用。订单金额、收款和成本仍归属来源订单，执行门店只维护施工过程与材料领用记录。" />
    <Tabs activeKey={scope} onChange={(key) => setScope(key as CrossStoreTaskScope)} items={[{ key: "EXECUTION", label: "执行门店任务" }, { key: "SOURCE", label: "来源门店跟进" }]} />
    <Card title="任务列表" extra={<Select allowClear placeholder="按状态筛选" style={{ width: 190 }} options={statusOptions} value={status} onChange={setStatus} />}>
      <Table rowKey="id" loading={tasksQuery.isLoading} dataSource={tasks} columns={columns} scroll={{ x: 1200 }} locale={{ emptyText: "暂无跨店施工任务" }} />
    </Card>
    {canConfigureMappings && <Card title="产品映射（来源门店 → 执行门店）" style={{ marginTop: 16 }} extra={<Select placeholder="选择执行门店" style={{ width: 240 }} value={mappingStoreId} onChange={(value) => { setMappingStoreId(value); mappingForm.resetFields(); }} options={mappingStores.map((store) => ({ value: store.id, label: store.name }))} />}>
      {!mappingStoreId ? <Alert type="warning" showIcon title="请先选择执行门店" description="只有同一财务主体且已启用跨店协作的门店会出现在这里。" /> : <>
        <Form form={mappingForm} layout="vertical" onFinish={(values) => mappingMutation.mutate(values)} initialValues={{ factor: 1 }}>
          <Space align="start" wrap>
            <Form.Item name="sourceProductId" label="来源产品" rules={[{ required: true, message: "请选择来源产品" }]}><Select showSearch optionFilterProp="label" style={{ width: 290 }} options={sourceProducts.map((product) => ({ value: product.id, label: productLabel(product) }))} onChange={(value) => { const product = sourceProducts.find((item) => item.id === value); mappingForm.setFieldsValue({ sourceSalesUnit: product?.salesUnit || product?.unit || "" }); }} /></Form.Item>
            <Form.Item name="executionProductId" label="执行门店产品" rules={[{ required: true, message: "请选择执行门店产品" }]}><Select showSearch optionFilterProp="label" style={{ width: 290 }} options={executionProducts.map((product) => ({ value: product.id, label: productLabel(product) }))} onChange={(value) => { const product = executionProducts.find((item) => item.id === value); mappingForm.setFieldsValue({ executionInventoryUnit: product?.inventoryUnit || product?.unit || "" }); }} /></Form.Item>
            <Form.Item name="sourceSalesUnit" label="来源销售单位" rules={[{ required: true }]}><Input style={{ width: 150 }} /></Form.Item>
            <Form.Item name="executionInventoryUnit" label="执行库存单位" rules={[{ required: true }]}><Input style={{ width: 150 }} /></Form.Item>
            <Form.Item name="factor" label="执行数量/来源单位" rules={[{ required: true, type: "number", min: 0.000001 }]}><InputNumber min={0.000001} precision={6} style={{ width: 180 }} /></Form.Item>
            <Form.Item label=" "><Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={mappingMutation.isPending}>保存映射</Button></Form.Item>
          </Space>
        </Form>
        <Table rowKey="id" loading={mappingsQuery.isLoading} dataSource={mappingRows} columns={mappingColumns} pagination={false} locale={{ emptyText: "暂无产品映射，订单将无法锁定执行门店库存" }} />
      </>}
    </Card>}
    <Modal open={Boolean(actionModal)} title={actionModal?.kind === "reject" ? "拒绝协作任务" : actionModal?.kind === "cancel" ? "取消跨店协作" : "提交施工验收"} okText="确认提交" cancelText="返回" confirmLoading={taskMutation.isPending} onCancel={() => setActionModal(null)} onOk={() => actionForm.submit()}>
      <Form form={actionForm} layout="vertical" onFinish={(values) => actionModal && taskMutation.mutate({ kind: actionModal.kind, task: actionModal.task, reason: values.reason })}>
        <Form.Item name="reason" label={actionModal?.kind === "submit" ? "验收说明" : "原因"} rules={[{ required: true, message: "请填写说明" }]}><Input.TextArea rows={4} placeholder={actionModal?.kind === "submit" ? "说明施工完成、照片和异常情况" : "请填写原因，便于双方追踪"} /></Form.Item>
      </Form>
    </Modal>
  </div>;
}
