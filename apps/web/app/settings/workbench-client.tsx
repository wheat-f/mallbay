"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Card, Empty, List, Result, Space, Spin, Tag, Typography } from "antd";
import { AuditOutlined, BankOutlined, KeyOutlined, LockOutlined, ShopOutlined, UserOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { settingsApi, type SettingsAuditRow } from "../../src/features/settings/api";
import { capabilityStatus, DOMAIN_META, groupCapabilities, type CapabilityView, type SettingsDomain } from "../../src/features/settings/workbench-model";
import { useAuthStore } from "../../src/stores/auth-store";

const DOMAIN_ICONS: Record<SettingsDomain, React.ReactNode> = { HQ: <LockOutlined />, STORE: <ShopOutlined />, FINANCE: <BankOutlined />, OWN: <UserOutlined /> };
const PATHS: Record<string, string> = {
  "settings.dictionary": "/settings/dictionaries",
  "store.dictionary": "/settings/dictionaries",
  "settings.permissions": "/settings/permissions",
  "settings.security": "/settings/security",
  "customer.tags": "/settings/customer-tags",
  "store.profile": "/settings/store?capability=store.profile",
  "store.operations": "/settings/store?capability=store.operations",
  "store.notifications": "/settings/store?capability=store.notifications",
  "store.capacity": "/settings/store?capability=store.capacity",
  "settings.audit.global": "/settings/audit",
  "finance.audit": "/settings/audit?domain=FINANCE",
  "finance.labor_cost": "/settings/finance",
  "finance.settlement": "/settings/finance",
  "finance.accounts": "/settings/finance",
  "account.profile": "/profile"
};

export default function SettingsPage() {
  const router = useRouter();
  const hydrated = useAuthStore((state) => state.hasHydrated);
  const [capabilities, setCapabilities] = useState<CapabilityView[]>([]);
  const [summaryByCode, setSummaryByCode] = useState<Record<string, { status: string; pendingCount: number; validationFailedCount: number; version: number | null; updatedAt: string | null }>>({});
  const [recentChanges, setRecentChanges] = useState<SettingsAuditRow[]>([]);
  const [recentAccess, setRecentAccess] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    setLoading(true);
    try { setRecentAccess(JSON.parse(window.localStorage.getItem("settings-recent-access") ?? "[]")); } catch { setRecentAccess([]); }
    Promise.all([settingsApi.capabilities(), settingsApi.summary(), settingsApi.audit("limit=5")]).then(([data, summary, audit]) => {
      if (!cancelled) { setCapabilities(data); setSummaryByCode(Object.fromEntries(summary.cards.map((card) => [card.code, card]))); setRecentChanges(audit.rows); setError(null); }
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : "设置能力加载失败");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [hydrated]);

  const groups = useMemo(() => groupCapabilities(capabilities), [capabilities]);
  const openCapability = (code: string) => { const next = [code, ...recentAccess.filter((item) => item !== code)].slice(0, 5); setRecentAccess(next); window.localStorage.setItem("settings-recent-access", JSON.stringify(next)); const path = PATHS[code]; if (path) router.push(path); };
  if (!hydrated || loading) return <div className="management-page settings-workspace"><Spin size="large" description="正在加载我的职责…" /></div>;
  if (error) return <div className="management-page settings-workspace"><Alert type="error" showIcon message="无法加载系统设置" description={error} action={<Button onClick={() => window.location.reload()}>重新加载</Button>} /></div>;
  if (!groups.length) return <div className="management-page settings-workspace"><Result status="403" title="当前角色无权访问系统设置" subTitle="请联系管理员确认你的职责与门店归属。" extra={<Button type="primary" onClick={() => router.push("/dashboard")}>返回首页</Button>} /></div>;

  return <div className="management-page settings-workspace">
    <header className="settings-workbench-header">
      <div><Typography.Title level={2}>我的职责</Typography.Title><Typography.Paragraph type="secondary">按职责进入设置，所有变更以服务端校验和发布结果为准。</Typography.Paragraph></div>
      <Space><Button icon={<AuditOutlined />} onClick={() => router.push("/settings/audit")}>查看审计</Button><Button onClick={() => router.push("/settings/all")}>查看全部设置</Button></Space>
    </header>
    {(recentAccess.length > 0 || recentChanges.length > 0) ? <Space align="start" size={16} wrap style={{ width: "100%", marginBottom: 20 }}>
      {recentAccess.length > 0 ? <Card title="最近访问" size="small"><Space wrap>{recentAccess.map((code) => <Button key={code} type="link" onClick={() => openCapability(code)}>{capabilities.find((item) => item.code === code)?.name ?? code}</Button>)}</Space></Card> : null}
      {recentChanges.length > 0 ? <Card title="最近变更" size="small"><List size="small" dataSource={recentChanges} renderItem={(row) => <List.Item><Space><Tag color="blue">{row.actionLabel}</Tag><Typography.Text>{row.targetTypeLabel} · {row.targetName}</Typography.Text><Typography.Text type="secondary">{new Date(row.createdAt).toLocaleString("zh-CN")}</Typography.Text></Space></List.Item>} /></Card> : null}
    </Space> : null}
    <div className="settings-workbench-grid">
      {groups.map((group) => <section key={group.domain} className="settings-domain-section">
        <div className="settings-domain-heading"><span className="settings-domain-icon">{DOMAIN_ICONS[group.domain]}</span><div><Typography.Title level={3}>{group.title}</Typography.Title><Typography.Text type="secondary">{group.description}</Typography.Text></div></div>
        <div className="settings-capability-grid">
          {group.capabilities.map((capability) => <CapabilityCard key={capability.code} capability={capability} summary={summaryByCode[capability.code]} onOpen={() => openCapability(capability.code)} />)}
        </div>
      </section>)}
    </div>
  </div>;
}

function CapabilityCard({ capability, summary, onOpen }: { capability: CapabilityView; summary?: { status: string; pendingCount: number; validationFailedCount: number; version: number | null; updatedAt: string | null }; onOpen: () => void }) {
  const status = capability.planned ? capabilityStatus(capability) : summary?.validationFailedCount ? { label: "校验失败", tone: "neutral" as const } : summary?.pendingCount ? { label: "待发布", tone: "blue" as const } : capabilityStatus(capability);
  const canOpen = Boolean(PATHS[capability.code]) && !capability.planned;
  return <Card className="settings-capability-card" hoverable={canOpen}>
    <div className="settings-capability-card-top"><Typography.Title level={4}>{capability.name}</Typography.Title><Tag color={status.tone === "green" ? "success" : status.tone === "blue" ? "blue" : undefined}>{status.label}</Tag></div>
    <Typography.Text type="secondary">{capability.scope === "global" ? "全局配置" : capability.scope === "store" ? `当前门店 · ${capability.scopeId ?? "未绑定"}` : capability.scope === "own" ? "仅本人" : "只读"}</Typography.Text>
    <div className="settings-capability-meta"><span>{summary?.version ? `版本 v${summary.version}` : "暂无已保存版本"}</span><span>{summary?.updatedAt ? `更新：${new Date(summary.updatedAt).toLocaleString("zh-CN")}` : "尚未更新"}</span><span>来源：{capability.domain === "HQ" ? "总部模板" : capability.domain === "STORE" ? "门店配置" : capability.domain === "FINANCE" ? "财务版本" : "个人账号"}</span><span>操作：{capability.actions.filter((action) => ["edit", "publish", "audit"].includes(action)).join("、") || "查看"}</span></div>
    <Button type={canOpen ? "primary" : "default"} disabled={!canOpen} onClick={onOpen}>{canOpen ? "进入设置" : "规划中"}</Button>
  </Card>;
}
