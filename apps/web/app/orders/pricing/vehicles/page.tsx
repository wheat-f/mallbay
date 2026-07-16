"use client";

import {
  ArrowRightOutlined,
  CarOutlined,
  CheckCircleFilled,
  EditOutlined,
  PlusOutlined,
  SettingOutlined
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Collapse,
  Drawer,
  Empty,
  Input,
  InputNumber,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography
} from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { pricingApi, type VehicleModelMapping, type VehiclePriceClass } from "../../../../src/features/pricing/api";
import {
  PricingWorkspaceHeader,
  PricingWorkspaceTabs
} from "../../../../src/features/pricing/pricing-workspace";
import { useAuthStore } from "../../../../src/stores/auth-store";

type UnmatchedVehicle = {
  id: string;
  carModel: string;
  carPlate?: string | null;
  suggestedMapping?: {
    mappingId: string;
    modelKeyword: string;
    vehiclePriceClass?: { id: string; code: string; name: string };
  } | null;
};

export default function VehiclePricingPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const client = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingMapping, setEditingMapping] = useState<VehicleModelMapping | null>(null);
  const [editingClass, setEditingClass] = useState<VehiclePriceClass | null>(null);
  const [classCode, setClassCode] = useState("");
  const [className, setClassName] = useState("");
  const [brand, setBrand] = useState("");
  const [modelKeyword, setModelKeyword] = useState("");
  const [yearFrom, setYearFrom] = useState<number>();
  const [yearTo, setYearTo] = useState<number>();
  const [classId, setClassId] = useState<string>();
  const [editClassCode, setEditClassCode] = useState("");
  const [editClassName, setEditClassName] = useState("");
  const [editClassDefault, setEditClassDefault] = useState(false);

  const classesQuery = useQuery({
    queryKey: ["vehicle-price-classes", storeId],
    queryFn: () => pricingApi.vehicleClasses(storeId!),
    enabled: Boolean(storeId)
  });
  const mappingsQuery = useQuery({
    queryKey: ["vehicle-model-mappings", storeId],
    queryFn: () => pricingApi.vehicleMappings(storeId!),
    enabled: Boolean(storeId)
  });
  const unmatchedQuery = useQuery({
    queryKey: ["unmatched-vehicles", storeId],
    queryFn: () => pricingApi.unmatchedVehicles(storeId!),
    enabled: Boolean(storeId)
  });

  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data]);
  const unmatched = useMemo(() => (unmatchedQuery.data ?? []) as UnmatchedVehicle[], [unmatchedQuery.data]);

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ["vehicle-price-classes", storeId] });
    client.invalidateQueries({ queryKey: ["vehicle-model-mappings", storeId] });
    client.invalidateQueries({ queryKey: ["unmatched-vehicles", storeId] });
  };

  const createClassMutation = useMutation({
    mutationFn: () => pricingApi.createVehicleClass({ storeId: storeId!, code: classCode.trim(), name: className.trim() }),
    onSuccess: () => {
      message.success("车型级别已添加");
      setClassCode("");
      setClassName("");
      invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const updateClassMutation = useMutation({
    mutationFn: () => pricingApi.updateVehicleClass(editingClass!.id, {
      storeId: storeId!,
      code: editClassCode.trim(),
      name: editClassName.trim(),
      isDefault: editClassDefault
    }),
    onSuccess: () => {
      message.success("车型级别已更新");
      setEditingClass(null);
      invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const saveMappingMutation = useMutation({
    mutationFn: () => {
      const payload = {
        storeId: storeId!,
        brand: brand.trim() || undefined,
        modelKeyword: modelKeyword.trim(),
        yearFrom,
        yearTo,
        vehiclePriceClassId: classId!,
        priority: editingMapping?.priority ?? 0
      };
      return editingMapping
        ? pricingApi.updateVehicleMapping(editingMapping.id, payload)
        : pricingApi.createVehicleMapping(payload);
    },
    onSuccess: () => {
      message.success(editingMapping ? "车型匹配规则已更新" : "车型匹配规则已保存");
      closeMappingDrawer();
      invalidate();
    },
    onError: (error: Error) => message.error(error.message)
  });

  const openMappingDrawer = (vehicle?: UnmatchedVehicle) => {
    setEditingMapping(null);
    setBrand("");
    setModelKeyword(vehicle?.suggestedMapping?.modelKeyword || vehicle?.carModel || "");
    setClassId(vehicle?.suggestedMapping?.vehiclePriceClass?.id);
    setYearFrom(undefined);
    setYearTo(undefined);
    setDrawerOpen(true);
  };

  const editMapping = (mapping: VehicleModelMapping) => {
    setEditingMapping(mapping);
    setBrand(mapping.brand ?? "");
    setModelKeyword(mapping.modelKeyword);
    setClassId(mapping.vehiclePriceClass?.id ?? mapping.vehiclePriceClassId);
    setYearFrom(mapping.yearFrom ?? undefined);
    setYearTo(mapping.yearTo ?? undefined);
    setDrawerOpen(true);
  };

  const closeMappingDrawer = () => {
    setDrawerOpen(false);
    setEditingMapping(null);
    setBrand("");
    setModelKeyword("");
    setYearFrom(undefined);
    setYearTo(undefined);
    setClassId(undefined);
  };

  const editClass = (item: VehiclePriceClass) => {
    setEditingClass(item);
    setEditClassCode(item.code);
    setEditClassName(item.name);
    setEditClassDefault(item.isDefault);
  };

  const navigateStep = (step: number) => {
    if (step === 0) router.push("/orders/pricing?view=price");
    if (step === 2) router.push("/orders/pricing?view=protection");
    if (step === 3) router.push("/orders/pricing?view=versions");
  };

  const navigateTab = (key: "overview" | "price" | "vehicle" | "protection" | "versions") => {
    if (key === "vehicle") return;
    router.push(`/orders/pricing?view=${key}`);
  };

  return (
    <div className="management-page pricing-workspace-page">
      <PricingWorkspaceHeader activeStep={1} onStepChange={navigateStep} />

      <Card className="pricing-workspace-shell" variant="borderless">
        <PricingWorkspaceTabs active="vehicle" onChange={navigateTab} />

        <div className="pricing-vehicle-intro">
          <div>
            <Typography.Title level={3}>先处理尚未归类的车辆</Typography.Title>
            <Typography.Paragraph>
              新订单会按品牌、车型关键词和年份自动识别车型级别。系统把需要店长确认的真实车辆集中放在这里。
            </Typography.Paragraph>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openMappingDrawer()}>
            新建匹配规则
          </Button>
        </div>

        <section className="pricing-unmatched-section">
          <div className="pricing-section-title">
            <div>
              <Typography.Title level={4}>待归类车辆</Typography.Title>
              <Typography.Text type="secondary">处理后，相同车型的后续订单会自动采用对应级别。</Typography.Text>
            </div>
            <Tag color={unmatched.length ? "warning" : "success"}>{unmatched.length} 辆待处理</Tag>
          </div>

          {unmatched.length ? (
            <div className="pricing-unmatched-list">
              {unmatched.map((vehicle) => (
                <article className="pricing-unmatched-card" key={vehicle.id}>
                  <div className="pricing-vehicle-icon"><CarOutlined /></div>
                  <div className="pricing-unmatched-main">
                    <strong>{vehicle.carModel || "车型信息待补充"}</strong>
                    <span>{vehicle.carPlate || "未填写车牌"}</span>
                  </div>
                  <div className="pricing-unmatched-suggestion">
                    <small>系统建议</small>
                    <span>
                      {vehicle.suggestedMapping
                        ? `${vehicle.suggestedMapping.modelKeyword} → ${vehicle.suggestedMapping.vehiclePriceClass?.name ?? "选择级别"}`
                        : "尚无可用建议"}
                    </span>
                  </div>
                  <Button type="primary" ghost onClick={() => openMappingDrawer(vehicle)}>确认归类</Button>
                </article>
              ))}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="所有车辆都已完成归类" />
          )}
        </section>

        <section className="pricing-mapping-section">
          <div className="pricing-section-title">
            <div>
              <Typography.Title level={4}>当前匹配规则</Typography.Title>
              <Typography.Text type="secondary">仅展示业务人员需要核对的信息，系统会自动处理匹配顺序。</Typography.Text>
            </div>
          </div>
          <Table<VehicleModelMapping>
            rowKey="id"
            loading={mappingsQuery.isLoading}
            dataSource={mappingsQuery.data ?? []}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            locale={{ emptyText: "还没有车型匹配规则" }}
            columns={[
              { title: "适用品牌", dataIndex: "brand", render: (value: string | null) => value || "全部品牌" },
              { title: "车型关键词", dataIndex: "modelKeyword" },
              { title: "适用年份", render: (_, row) => row.yearFrom || row.yearTo ? `${row.yearFrom ?? "不限"} 至 ${row.yearTo ?? "不限"}` : "全部年份" },
              { title: "车型级别", render: (_, row) => <Tag color="blue">{row.vehiclePriceClass?.name ?? "未设置"}</Tag> },
              { title: "操作", width: 100, render: (_, row) => <Button type="link" icon={<EditOutlined />} onClick={() => editMapping(row)}>修改</Button> }
            ]}
          />
        </section>

        <Collapse
          className="pricing-advanced-maintenance"
          ghost
          items={[{
            key: "advanced",
            label: <Space><SettingOutlined />高级维护：车型级别与通用映射</Space>,
            children: (
              <div className="pricing-advanced-maintenance-grid">
                <Card size="small" title="新增车型级别">
                  <Space orientation="vertical" className="pricing-field-stack">
                    <Input placeholder="级别简称，例如 A" value={classCode} onChange={(event) => setClassCode(event.target.value)} />
                    <Input placeholder="级别名称，例如 豪华车型" value={className} onChange={(event) => setClassName(event.target.value)} />
                    <Button
                      type="primary"
                      disabled={!classCode.trim() || !className.trim()}
                      loading={createClassMutation.isPending}
                      onClick={() => createClassMutation.mutate()}
                    >
                      添加级别
                    </Button>
                  </Space>
                </Card>
                <Card size="small" title="已维护车型级别">
                  <div className="pricing-class-list">
                    {classes.length
                      ? classes.map((item) => (
                        <article key={item.id}>
                          <div><strong>{item.name || "名称待补充"}</strong><span>{item.code}{item.isDefault ? " · 默认级别" : ""}</span></div>
                          <Button type="link" icon={<EditOutlined />} onClick={() => editClass(item)}>修改</Button>
                        </article>
                      ))
                      : <Typography.Text type="secondary">暂未维护车型级别</Typography.Text>}
                  </div>
                </Card>
              </div>
            )
          }]}
        />

        <div className="pricing-workspace-footer">
          <div><CheckCircleFilled /> 本页设置保存后立即用于草稿试算</div>
          <Button type="primary" onClick={() => router.push("/orders/pricing?view=protection")}>
            下一步：改价审批与保护 <ArrowRightOutlined />
          </Button>
        </div>
      </Card>

      <Drawer
        title={editingMapping ? "修改车型匹配规则" : "创建车型匹配规则"}
        size="default"
        open={drawerOpen}
        onClose={closeMappingDrawer}
        extra={(
          <Button
            type="primary"
            disabled={!modelKeyword.trim() || !classId}
            loading={saveMappingMutation.isPending}
            onClick={() => saveMappingMutation.mutate()}
          >
            保存规则
          </Button>
        )}
      >
        <Alert type="info" showIcon title="品牌和年份可留空，表示适用于全部品牌或全部年份。" />
        <div className="pricing-drawer-form">
          <label>车型关键词<Input value={modelKeyword} onChange={(event) => setModelKeyword(event.target.value)} placeholder="例如 Model Y" /></label>
          <label>车型级别<Select value={classId} onChange={setClassId} placeholder="选择车型级别" options={classes.map((item) => ({ value: item.id, label: item.name }))} /></label>
          <label>品牌（选填）<Input value={brand} onChange={(event) => setBrand(event.target.value)} placeholder="例如 特斯拉" /></label>
          <div className="pricing-year-range">
            <label>起始年份<InputNumber value={yearFrom} onChange={(value) => setYearFrom(value ?? undefined)} placeholder="不限" /></label>
            <label>结束年份<InputNumber value={yearTo} onChange={(value) => setYearTo(value ?? undefined)} placeholder="不限" /></label>
          </div>
        </div>
      </Drawer>

      <Drawer
        title="修改车型级别"
        size="default"
        open={Boolean(editingClass)}
        onClose={() => setEditingClass(null)}
        extra={(
          <Button
            type="primary"
            disabled={!editClassCode.trim() || !editClassName.trim()}
            loading={updateClassMutation.isPending}
            onClick={() => updateClassMutation.mutate()}
          >
            保存修改
          </Button>
        )}
      >
        <Alert type="info" showIcon title="修改后会用于后续新订单；已生成订单的价格快照不会改变。" />
        <div className="pricing-drawer-form">
          <label>级别简称<Input value={editClassCode} onChange={(event) => setEditClassCode(event.target.value)} placeholder="例如 A" /></label>
          <label>级别名称<Input value={editClassName} onChange={(event) => setEditClassName(event.target.value)} placeholder="例如 豪华车型" /></label>
          <label className="pricing-switch-field"><span>设为默认车型级别</span><Switch checked={editClassDefault} onChange={setEditClassDefault} /></label>
        </div>
      </Drawer>
    </div>
  );
}
