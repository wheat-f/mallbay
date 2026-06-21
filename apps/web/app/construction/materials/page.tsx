"use client";

import { App, Button, Card, Empty, InputNumber, Select, Space, Table, Tag } from "antd";
import {
  BarcodeOutlined,
  CameraOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  InboxOutlined,
  QrcodeOutlined,
  SafetyCertificateOutlined,
  ToolOutlined
} from "@ant-design/icons";
import type { ConstructionMaterialItem } from "../../../src/features/construction/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { constructionApi } from "../../../src/lib/api";
import { useAuthStore } from "../../../src/stores/auth-store";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type TaskRow = {
  id: string;
  orderId: string;
  status: string;
  order?: {
    orderNo?: string | null;
    appointmentDate?: string | null;
    appointmentTimeSlot?: string | null;
  } | null;
};

export default function ConstructionMaterialsPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const [selectedOrderId, setSelectedOrderId] = useState<string>();
  const [lossQuantityByBatch, setLossQuantityByBatch] = useState<Record<string, number>>({});

  const tasksQuery = useQuery({
    queryKey: ["construction-tasks", storeId, "materials-entry"],
    queryFn: () => constructionApi.assignments({ storeId: storeId! }),
    enabled: Boolean(storeId)
  });

  const taskRows = useMemo(() => (tasksQuery.data ?? []) as TaskRow[], [tasksQuery.data]);

  const effectiveSelectedOrderId = selectedOrderId ?? taskRows[0]?.orderId;

  const materialsQuery = useQuery({
    queryKey: ["construction-order-materials", effectiveSelectedOrderId],
    queryFn: () => constructionApi.orderMaterials(effectiveSelectedOrderId!),
    enabled: Boolean(effectiveSelectedOrderId)
  });

  const verifyMutation = useMutation({
    mutationFn: (batchId: string) => constructionApi.verifyMaterialBatch(effectiveSelectedOrderId!, { batchId }),
    onSuccess: async () => {
      message.success("批次已核验");
      await queryClient.invalidateQueries({ queryKey: ["construction-order-materials", effectiveSelectedOrderId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const pickupMutation = useMutation({
    mutationFn: (allocationIds: string[]) =>
      constructionApi.pickupMaterials(effectiveSelectedOrderId!, {
        allocationIds,
        note: "施工人员领取订单物料"
      }),
    onSuccess: async () => {
      message.success("领取记录已保存");
      await queryClient.invalidateQueries({ queryKey: ["construction-order-materials", effectiveSelectedOrderId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const lossMutation = useMutation({
    mutationFn: (payload: { batchId: string; quantity: number }) =>
      constructionApi.recordMaterialLoss(effectiveSelectedOrderId!, {
        ...payload,
        note: "施工现场损耗"
      }),
    onSuccess: async () => {
      message.success("损耗已同步库存流水");
      await queryClient.invalidateQueries({ queryKey: ["construction-order-materials", effectiveSelectedOrderId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const materialData = materialsQuery.data;
  const allAllocationIds = (materialData?.materials ?? []).flatMap((item) => item.batches.map((batch) => batch.allocationId));
  const pendingPickupBatches = Math.max(
    0,
    (materialData?.summary.allocatedBatches ?? 0) - (materialData?.summary.pickedBatches ?? 0)
  );

  return (
    <div className="management-page worker-materials-page">
      <StorePageHeader title="施工物料核验" description="按真实施工任务核对订单物料、锁定批次、现场领取和损耗流水。">
        <Button icon={<ClockCircleOutlined />} onClick={() => router.push("/inventory/movements")}>
          查看库存流水
        </Button>
        <Button type="primary" icon={<CameraOutlined />} onClick={() => router.push("/construction/camera")}>
          施工照片上传
        </Button>
      </StorePageHeader>

      <section className="worker-materials-hero">
        <div>
          <Tag color="processing">选择施工任务</Tag>
          <h2>{materialData?.order.orderNo ?? "请选择订单"}</h2>
          <p>开工前完成膜箱照片、膜桶照片、锁定批次扫码核验和物料领取记录，异常损耗记录后同步库存流水。</p>
        </div>
        <Space wrap>
          <Select
            className="worker-materials-task-select"
            loading={tasksQuery.isLoading}
            placeholder="选择施工任务"
            value={effectiveSelectedOrderId}
            onChange={setSelectedOrderId}
            options={taskRows.map((row) => ({
              value: row.orderId,
              label: `${row.order?.orderNo ?? row.orderId} · ${formatSchedule(row)}`
            }))}
          />
          <Button
            type="primary"
            icon={<InboxOutlined />}
            disabled={allAllocationIds.length === 0}
            loading={pickupMutation.isPending}
            onClick={() => pickupMutation.mutate(allAllocationIds)}
          >
            领取物料
          </Button>
          <Button icon={<ToolOutlined />} onClick={() => router.push("/construction/tasks")}>
            返回我的任务
          </Button>
        </Space>
      </section>

      <div className="construction-materials-workspace">
        <section className="construction-materials-summary" aria-label="物料状态概览">
          {[
            { label: "待领物料", value: pendingPickupBatches, tone: "primary" },
            { label: "锁定批次", value: materialData?.summary.allocatedBatches ?? 0, tone: "warning" },
            { label: "已核验批次", value: materialData?.summary.verifiedBatches ?? 0, tone: "success" },
            { label: "已存证照片", value: materialData?.summary.photoCount ?? 0, tone: "primary" }
          ].map((item) => (
            <article key={item.label} className={`construction-materials-stat is-${item.tone}`}>
              <strong>{item.value}</strong>
              <span>{item.label}</span>
            </article>
          ))}
        </section>

        <section className="worker-materials-grid">
          <Card
            className="construction-materials-card worker-materials-main-card"
            title="批次追溯"
            extra={<SafetyCertificateOutlined />}
          >
            <p className="worker-materials-card-copy">核对订单物料、批次号和领取状态，施工后可追溯到质保与售后。</p>
            <Table<ConstructionMaterialItem>
              rowKey="orderItemId"
              loading={materialsQuery.isLoading}
              dataSource={materialData?.materials ?? []}
              pagination={false}
              locale={{ emptyText: <Empty description="暂无锁定物料，请先完成订单库存匹配" /> }}
              columns={[
                {
                  title: "产品规格",
                  render: (_, row) => (
                    <div className="worker-materials-product">
                      <strong>{row.productLabel}</strong>
                      <span>需求 {row.requiredQuantity} {row.unit}</span>
                    </div>
                  )
                },
                { title: "锁定数量", dataIndex: "allocatedQuantity" },
                { title: "领取数量", dataIndex: "pickedQuantity" },
                {
                  title: "核验",
                  render: (_, row) => `${row.verifiedQuantity}/${row.batches.length}`
                }
              ]}
            />
            <div className="construction-materials-batch-list">
              {(materialData?.materials ?? []).flatMap((item) =>
                item.batches.map((batch) => (
                  <article key={batch.allocationId} className="construction-materials-batch">
                    <div className="construction-materials-batch-main">
                      <BarcodeOutlined />
                      <div>
                        <strong>{batch.batchNo}</strong>
                        <span>{item.productLabel}</span>
                        <em>
                          锁定 {batch.lockedQuantity} {batch.unit} · 可用 {batch.availableQuantity} {batch.unit}
                        </em>
                      </div>
                    </div>
                    <dl>
                      <div>
                        <dt>供应商</dt>
                        <dd>{batch.supplierName ?? "供应商待确认"}</dd>
                      </div>
                      <div>
                        <dt>领取</dt>
                        <dd>{batch.pickedUp ? "已领取" : "待领取"}</dd>
                      </div>
                    </dl>
                    <Space wrap>
                      <Tag color={batch.verified ? "success" : "warning"}>{batch.verified ? "已核验" : "待扫码"}</Tag>
                      <Button
                        size="small"
                        icon={<QrcodeOutlined />}
                        disabled={batch.verified}
                        loading={verifyMutation.isPending}
                        onClick={() => verifyMutation.mutate(batch.batchId)}
                      >
                        扫码核验
                      </Button>
                      <InputNumber
                        min={0.001}
                        step={0.1}
                        placeholder="损耗"
                        value={lossQuantityByBatch[batch.batchId]}
                        onChange={(value) => setLossQuantityByBatch((current) => ({
                          ...current,
                          [batch.batchId]: Number(value ?? 0)
                        }))}
                      />
                      <Button
                        size="small"
                        loading={lossMutation.isPending}
                        onClick={() => {
                          const quantity = lossQuantityByBatch[batch.batchId] ?? 0;
                          if (quantity <= 0) {
                            message.warning("请填写损耗数量");
                            return;
                          }
                          lossMutation.mutate({ batchId: batch.batchId, quantity });
                        }}
                      >
                        记录损耗
                      </Button>
                    </Space>
                  </article>
                ))
              )}
              {!materialsQuery.isLoading && (materialData?.summary.allocatedBatches ?? 0) === 0 ? (
                <Empty description="当前订单暂无锁定批次" />
              ) : null}
            </div>
          </Card>

          <aside className="worker-materials-side">
            <Card className="construction-materials-card" title="施工耗材与照片" extra={<ToolOutlined />}>
              <p className="worker-materials-card-copy">开工前确认膜箱照片、膜桶照片和常用耗材齐备。</p>
              <div className="construction-materials-consumables">
                {["膜箱照片", "膜桶照片", "裁膜刀片", "刮板毛毡", "安装液", "无尘布"].map((item) => (
                  <span key={item}>
                    <CheckCircleOutlined />
                    {item}
                  </span>
                ))}
              </div>
            </Card>

            <Card className="construction-materials-card" title="现场操作">
              <div className="construction-materials-actions">
                <Button type="primary" icon={<CameraOutlined />} onClick={() => router.push("/construction/camera")}>
                  施工照片上传
                </Button>
                <Button icon={<InboxOutlined />} disabled={allAllocationIds.length === 0} onClick={() => pickupMutation.mutate(allAllocationIds)}>
                  领取物料
                </Button>
                <Button icon={<ClockCircleOutlined />} onClick={() => router.push("/inventory/movements")}>
                  查看损耗流水
                </Button>
              </div>
            </Card>
          </aside>
        </section>
      </div>
    </div>
  );
}

function formatSchedule(row: TaskRow) {
  return [row.order?.appointmentDate?.slice(0, 10), row.order?.appointmentTimeSlot].filter(Boolean).join(" ") || "预约待确认";
}
