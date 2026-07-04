"use client";

import type { InventoryWarehouseSummary } from "@mallbay/shared";
import { Alert, App, Button, Card, Form, Input, Modal, Switch, Table, Tag } from "antd";
import { ArrowLeftOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "../../../src/lib/api";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

type WarehouseFormValues = {
  name: string;
  code?: string;
  area?: string;
  address?: string;
  isActive?: boolean;
};

export default function WarehouseManagementPage() {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<WarehouseFormValues>();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<InventoryWarehouseSummary | null>(null);
  const user = useAuthStore((state) => state.user);
  const storeId = user?.storeMember?.store.id;
  const canManageInventory = user?.isAuditor === true ||
    user?.storeMember?.position === "MANAGER" ||
    user?.storeMember?.position === "PURCHASING";

  const warehousesQuery = useQuery({
    queryKey: ["inventory-warehouses", storeId],
    queryFn: () => inventoryApi.warehouses(storeId!),
    enabled: Boolean(storeId)
  });
  const warehouses = (warehousesQuery.data ?? []) as InventoryWarehouseSummary[];

  const createWarehouse = useMutation({
    mutationFn: (values: WarehouseFormValues) => inventoryApi.createWarehouse({
      storeId: storeId!,
      ...values,
      isActive: values.isActive ?? true
    }),
    onSuccess: async () => {
      message.success("仓库已创建");
      setModalOpen(false);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["inventory-warehouses", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const updateWarehouse = useMutation({
    mutationFn: (values: WarehouseFormValues) => inventoryApi.updateWarehouse(editingWarehouse!.id, values),
    onSuccess: async () => {
      message.success("仓库已更新");
      setModalOpen(false);
      setEditingWarehouse(null);
      form.resetFields();
      await queryClient.invalidateQueries({ queryKey: ["inventory-warehouses", storeId] });
    },
    onError: (error: Error) => message.error(error.message)
  });

  const openCreateModal = () => {
    setEditingWarehouse(null);
    form.setFieldsValue({ isActive: true });
    setModalOpen(true);
  };

  const openEditModal = (warehouse: InventoryWarehouseSummary) => {
    setEditingWarehouse(warehouse);
    form.setFieldsValue({
      name: warehouse.name,
      code: warehouse.code ?? undefined,
      area: warehouse.area ?? undefined,
      address: warehouse.address ?? undefined,
      isActive: warehouse.isActive
    });
    setModalOpen(true);
  };

  const handleSubmit = (values: WarehouseFormValues) => {
    if (editingWarehouse) {
      updateWarehouse.mutate(values);
      return;
    }
    createWarehouse.mutate(values);
  };

  return (
    <div className="management-page warehouse-workspace-page">
      <StorePageHeader title="仓库管理" description="维护门店仓库、库区和启用状态，到货验收会从这里选择入库位置。">
        <Button icon={<ArrowLeftOutlined />} href="/inventory">
          返回库存总览
        </Button>
        <Button type="primary" icon={<PlusOutlined />} disabled={!canManageInventory} onClick={openCreateModal}>
          新建仓库
        </Button>
      </StorePageHeader>

      {!canManageInventory ? (
        <Alert
          className="management-readonly-alert"
          type="info"
          showIcon
          message="只读模式"
          description="当前账号可查看仓库配置，不能新增、编辑或停用仓库。"
        />
      ) : null}

      <section className="warehouse-workspace-grid">
        <Card className="inventory-prototype-card warehouse-list-card" title="门店仓库">
          <Table<InventoryWarehouseSummary>
            rowKey="id"
            loading={warehousesQuery.isLoading}
            dataSource={warehouses}
            pagination={false}
            columns={[
              { title: "仓库名称", dataIndex: "name" },
              { title: "编码", render: (_, row) => row.code ?? "-" },
              { title: "库区", render: (_, row) => row.area ?? "-" },
              { title: "地址", render: (_, row) => row.address ?? "-" },
              {
                title: "状态",
                render: (_, row) => <Tag color={row.isActive ? "success" : "default"}>{row.isActive ? "启用" : "停用"}</Tag>
              },
              {
                title: "操作",
                render: (_, row) => (
                  <Button icon={<EditOutlined />} disabled={!canManageInventory} onClick={() => openEditModal(row)}>
                    编辑
                  </Button>
                )
              }
            ]}
          />
        </Card>

        <Card className="inventory-prototype-card warehouse-guide-card" title="关联流程">
          <div className="warehouse-guide-list">
            <Link href="/purchases/orders"><strong>采购到货验收</strong><span>验收入库时选择仓库并写入批次、流水</span></Link>
            <Link href="/inventory/movements"><strong>库存流水</strong><span>按批次查看入库、锁库、出库和调整记录</span></Link>
            <Link href="/inventory/adjustments"><strong>库存调整</strong><span>盘点、报损、调拨会继续使用仓库主数据</span></Link>
          </div>
        </Card>
      </section>

      <Modal
        title={editingWarehouse ? "编辑仓库" : "新建仓库"}
        open={modalOpen}
        okText={editingWarehouse ? "保存仓库" : "创建仓库"}
        cancelText="取消"
        confirmLoading={createWarehouse.isPending || updateWarehouse.isPending}
        onOk={() => form.submit()}
        onCancel={() => {
          setModalOpen(false);
          setEditingWarehouse(null);
          form.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="name" label="仓库名称" rules={[{ required: true, message: "请输入仓库名称" }]}>
            <Input placeholder="例如 主仓库" />
          </Form.Item>
          <Form.Item name="code" label="仓库编码">
            <Input placeholder="例如 MAIN-A" />
          </Form.Item>
          <Form.Item name="area" label="库区">
            <Input placeholder="例如 A 区" />
          </Form.Item>
          <Form.Item name="address" label="仓库地址">
            <Input placeholder="例如 门店后场一层" />
          </Form.Item>
          <Form.Item name="isActive" label="启用状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="停用" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
