"use client";
import { useEffect, useState } from "react";
import { Alert, Button, List, Result, Space, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../src/stores/auth-store";
import { settingsApi, type ConfigVersion } from "../../../src/features/settings/api";
import { SettingsVersionEditor } from "../../../src/features/settings/settings-version-editor";

type StoreCapability = "store.profile" | "store.operations" | "store.notifications" | "store.capacity";
type StoreField = { key: string; label: string; type?: "text" | "number" | "boolean" | "password"; help?: string; min?: number; sensitive?: boolean };
const READ_ONLY_CAPABILITIES = ["store.profile", "store.operations", "store.capacity"];
const CAPABILITY_META: Record<StoreCapability, { title: string; description: string }> = {
  "store.profile": { title: "门店资料", description: "维护门店名称、地址、联系方式和营业时间。" },
  "store.operations": { title: "业务开关", description: "维护预约、库存预警和施工流程等业务开关。" },
  "store.notifications": { title: "通知与 OSS", description: "维护通知接收人、短信提醒及对象存储连接配置。" },
  "store.capacity": { title: "预约与容量默认值", description: "维护到店、外出、玻璃膜和复检的默认容量。" }
};

function isStoreCapability(value: string | null): value is StoreCapability {
  return value === "store.profile" || value === "store.operations" || value === "store.notifications" || value === "store.capacity";
}

export default function StoreSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.storeMember?.store.id;
  const [capability, setCapability] = useState<StoreCapability>("store.profile");
  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get("capability");
    if (isStoreCapability(value)) setCapability(value);
  }, []);
  if (!storeId && !user?.isAuditor) return <Result status="403" title="未绑定门店" extra={<Button onClick={() => router.push("/settings")}>返回设置</Button>} />;
  if (user?.isAuditor && !storeId) return <HeadquartersStoreReadOnly onBack={() => router.push("/settings")} />;
  const meta = CAPABILITY_META[capability];
  return <div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}>
    <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button>
    <div><Typography.Title level={2}>{meta.title}</Typography.Title><Typography.Paragraph type="secondary">{meta.description} 保存后服务端校验、发布并返回最新版本。</Typography.Paragraph></div>
    <SettingsVersionEditor capabilityCode={capability} domain="STORE" scopeId={storeId!} title={meta.title} description={meta.description} fields={fieldsFor(capability)} initial={initialFor(capability)} />
  </Space></div>;
}

function fieldsFor(capability: StoreCapability): StoreField[] {
  if (capability === "store.profile") return [{ key: "name", label: "门店名称" }, { key: "address", label: "地址" }, { key: "description", label: "门店说明", type: "text" }, { key: "phone", label: "联系电话" }, { key: "businessHours", label: "营业时间" }];
  if (capability === "store.notifications") return [{ key: "recipients", label: "通知接收人" }, { key: "smsReminderEnabled", label: "短信提醒", type: "boolean" }, { key: "ossEndpoint", label: "OSS Endpoint" }, { key: "ossAccessKey", label: "OSS AccessKey" }, { key: "ossSecretKey", label: "OSS SecretKey", type: "password", sensitive: true }];
  if (capability === "store.operations") return [{ key: "appointmentEnabled", label: "预约能力", type: "boolean" }, { key: "inventoryAlertEnabled", label: "库存预警", type: "boolean" }, { key: "constructionPhotoRequired", label: "施工流程照片", type: "boolean" }, { key: "smsReminderEnabled", label: "短信提醒", type: "boolean" }, { key: "disableReason", label: "关闭高风险开关原因", help: "关闭任一高风险开关时必填" }];
  return [{ key: "inStoreCapacity", label: "到店容量", type: "number", min: 0 }, { key: "outsideCapacity", label: "外出容量", type: "number", min: 0 }, { key: "glassFilmCapacity", label: "玻璃膜容量", type: "number", min: 0 }, { key: "reinspectionCapacity", label: "复检容量", type: "number", min: 0 }];
}

function initialFor(capability: StoreCapability): Record<string, unknown> {
  if (capability === "store.profile") return { name: "", address: "", description: "", phone: "", businessHours: "" };
  if (capability === "store.notifications") return { recipients: "", smsReminderEnabled: true, ossEndpoint: "", ossAccessKey: "", ossSecretKey: "" };
  if (capability === "store.operations") return { appointmentEnabled: true, inventoryAlertEnabled: true, constructionPhotoRequired: true, smsReminderEnabled: true, disableReason: "" };
  return { inStoreCapacity: 4, outsideCapacity: 1, glassFilmCapacity: 2, reinspectionCapacity: 1 };
}

function HeadquartersStoreReadOnly({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<ConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all(READ_ONLY_CAPABILITIES.map((code) => settingsApi.configVersions(code))).then((sets) => setRows(sets.flatMap((set) => set.rows))).catch((reason) => setError(reason instanceof Error ? reason.message : "门店配置加载失败")).finally(() => setLoading(false)); }, []);
  return <div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}><Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回职责工作台</Button><Typography.Title level={2}>门店运营（总部只读）</Typography.Title>{loading ? <Spin description="正在加载各门店配置…" /> : error ? <Alert type="error" showIcon message={error} /> : <List bordered dataSource={rows} locale={{ emptyText: "暂无门店配置版本" }} renderItem={(row) => <List.Item><List.Item.Meta title={<Space>{row.capabilityCode}<Tag>门店 {row.scopeId}</Tag><Tag color={row.status === "PUBLISHED" ? "green" : "gold"}>{row.status}</Tag></Space>} description={`版本 v${row.version} · ${row.updatedAt ?? "未记录更新时间"}`} /></List.Item>} />}</Space></div>;
}