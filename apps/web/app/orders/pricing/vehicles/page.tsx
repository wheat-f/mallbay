"use client";

import { App, Alert, Button, Card, Input, InputNumber, Select, Space, Table, Tag } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { pricingApi, type VehicleModelMapping } from "../../../../src/features/pricing/api";
import { useAuthStore } from "../../../../src/stores/auth-store";
import { StorePageHeader } from "../../../../src/features/workbench/store-page-header";

export default function VehiclePricingPage() {
  const { message } = App.useApp();
  const client = useQueryClient();
  const storeId = useAuthStore((state) => state.user?.storeMember?.store.id);
  const [classCode, setClassCode] = useState("");
  const [className, setClassName] = useState("");
  const [brand, setBrand] = useState("");
  const [modelKeyword, setModelKeyword] = useState("");
  const [yearFrom, setYearFrom] = useState<number>();
  const [yearTo, setYearTo] = useState<number>();
  const [classId, setClassId] = useState<string>();
  const classesQuery = useQuery({ queryKey: ["vehicle-price-classes", storeId], queryFn: () => pricingApi.vehicleClasses(storeId!), enabled: Boolean(storeId) });
  const mappingsQuery = useQuery({ queryKey: ["vehicle-model-mappings", storeId], queryFn: () => pricingApi.vehicleMappings(storeId!), enabled: Boolean(storeId) });
  const unmatchedQuery = useQuery({ queryKey: ["unmatched-vehicles", storeId], queryFn: () => pricingApi.unmatchedVehicles(storeId!), enabled: Boolean(storeId) });
  const invalidate = () => { client.invalidateQueries({ queryKey: ["vehicle-price-classes", storeId] }); client.invalidateQueries({ queryKey: ["vehicle-model-mappings", storeId] }); client.invalidateQueries({ queryKey: ["unmatched-vehicles", storeId] }); };
  const createClassMutation = useMutation({
    mutationFn: () => pricingApi.createVehicleClass({ storeId: storeId!, code: classCode, name: className }),
    onSuccess: () => { message.success("车辆价格级别已创建"); setClassCode(""); setClassName(""); invalidate(); },
    onError: (error: Error) => message.error(error.message)
  });
  const createMappingMutation = useMutation({
    mutationFn: () => pricingApi.createVehicleMapping({ storeId: storeId!, brand, modelKeyword, yearFrom, yearTo, vehiclePriceClassId: classId!, priority: 0 }),
    onSuccess: () => { message.success("车型映射已创建"); setBrand(""); setModelKeyword(""); invalidate(); },
    onError: (error: Error) => message.error(error.message)
  });
  return <div className="management-page">
    <StorePageHeader title="车辆价格级别与车型映射" description="按门店维护车型关键词、年份范围和价格级别；冲突映射会在保存时阻断" />
    <Alert className="mb-4" type="info" showIcon title="自动匹配只读取已启用映射；本单手动修正不会改写车辆主数据。" />
    <Card title="新增车辆价格级别">
      <Space wrap><Input placeholder="编码，如 A" value={classCode} onChange={(event) => setClassCode(event.target.value)} /><Input placeholder="名称，如 普通车型" value={className} onChange={(event) => setClassName(event.target.value)} /><Button type="primary" disabled={!classCode.trim() || !className.trim()} loading={createClassMutation.isPending} onClick={() => createClassMutation.mutate()}>保存级别</Button></Space>
    </Card>
    <Card className="mt-4" title="新增车型映射">
      <Space wrap><Input placeholder="品牌（可选）" value={brand} onChange={(event) => setBrand(event.target.value)} /><Input placeholder="车型关键词" value={modelKeyword} onChange={(event) => setModelKeyword(event.target.value)} /><InputNumber placeholder="起始年份" value={yearFrom} onChange={(value) => setYearFrom(value ?? undefined)} /><InputNumber placeholder="结束年份" value={yearTo} onChange={(value) => setYearTo(value ?? undefined)} /><Select placeholder="价格级别" value={classId} onChange={setClassId} options={(classesQuery.data ?? []).map((item) => ({ value: item.id, label: `${item.code} / ${item.name}` }))} /><Button type="primary" disabled={!modelKeyword.trim() || !classId} loading={createMappingMutation.isPending} onClick={() => createMappingMutation.mutate()}>保存映射</Button></Space>
    </Card>
    <Card className="mt-4" title="已维护映射"><Table<VehicleModelMapping> rowKey="id" loading={mappingsQuery.isLoading} dataSource={mappingsQuery.data ?? []} pagination={{ pageSize: 20 }} columns={[{ title: "品牌", dataIndex: "brand", render: (value: string | null) => value || "不限" }, { title: "车型关键词", dataIndex: "modelKeyword" }, { title: "年份", render: (_, row) => `${row.yearFrom ?? "不限"} - ${row.yearTo ?? "不限"}` }, { title: "级别", render: (_, row) => <Tag>{row.vehiclePriceClass?.code ?? "-"}</Tag> }, { title: "优先级", dataIndex: "priority" }]} /></Card>
    <Card className="mt-4" title="未归类车辆"><Table rowKey="id" loading={unmatchedQuery.isLoading} dataSource={unmatchedQuery.data ?? []} pagination={{ pageSize: 10 }} columns={[{ title: "车型", dataIndex: "carModel" }, { title: "车牌", dataIndex: "carPlate", render: (value: string | null) => value || "-" }, { title: "客户", dataIndex: "customerId" }, { title: "待确认建议", render: (_: unknown, row: { suggestedMapping?: { modelKeyword: string; vehiclePriceClass?: { code: string; name: string } } | null }) => row.suggestedMapping ? `${row.suggestedMapping.modelKeyword} → ${row.suggestedMapping.vehiclePriceClass?.code ?? "待分配"}` : "无关键词建议" }]} /></Card>
  </div>;
}
