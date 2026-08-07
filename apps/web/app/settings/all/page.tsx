"use client";
import { useEffect, useState } from "react";
import { Alert, Button, List, Result, Space, Spin, Tag, Typography } from "antd";
import { useRouter } from "next/navigation";
import { settingsApi } from "../../../src/features/settings/api";
import type { CapabilityView } from "../../../src/features/settings/workbench-model";

const PATHS: Record<string, string> = {
  "store.dictionary": "/settings/dictionaries",
  "settings.permissions": "/settings/permissions", "settings.dictionary": "/settings/dictionaries", "settings.security": "/settings/security", "customer.tags": "/settings/customer-tags", "settings.audit.global": "/settings/audit",
  "store.profile": "/settings/store?capability=store.profile", "store.operations": "/settings/store?capability=store.operations", "store.notifications": "/settings/store?capability=store.notifications", "store.capacity": "/settings/store?capability=store.capacity",
  "finance.labor_cost": "/settings/finance", "finance.settlement": "/settings/finance", "finance.accounts": "/settings/finance", "finance.audit": "/settings/audit?domain=FINANCE", "account.profile": "/profile"
};

export default function AllSettingsPage() {
  const router = useRouter();
  const [capabilities, setCapabilities] = useState<CapabilityView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { settingsApi.capabilities().then(setCapabilities).catch((reason) => setError(reason instanceof Error ? reason.message : "设置能力加载失败")).finally(() => setLoading(false)); }, []);
  if (loading) return <div className="management-page"><Spin description="正在加载全部设置…" /></div>;
  if (error) return <div className="management-page"><Alert type="error" showIcon title={error} /><Button onClick={() => router.push("/settings")}>返回职责工作台</Button></div>;
  if (!capabilities.length) return <Result status="403" title="当前角色无权访问系统设置" extra={<Button onClick={() => router.push("/dashboard")}>返回首页</Button>} />;
  return <div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}><Button onClick={() => router.push("/settings")}>返回职责工作台</Button><div><Typography.Title level={2}>全部设置</Typography.Title><Typography.Paragraph type="secondary">仅展示当前角色有权查看的能力；直接访问无权模块仍由服务端返回 403。</Typography.Paragraph></div><List bordered dataSource={capabilities} renderItem={(capability) => <List.Item actions={[<Button key="open" type="primary" disabled={capability.planned || !PATHS[capability.code]} onClick={() => router.push(PATHS[capability.code])}>{capability.planned ? "规划中" : "进入设置"}</Button>]}><List.Item.Meta title={<Space><span>{capability.name}</span><Tag>{capability.domain}</Tag></Space>} description={`范围：${capability.scopeId ?? capability.scope} · 操作：${capability.actions.join("、")}`} /></List.Item>} /></Space></div>;
}
