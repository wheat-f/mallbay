"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Card, Empty, List, Space, Spin, Tag, Typography } from "antd";
import { ArrowLeftOutlined, BankOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { useAuthStore } from "../../../src/stores/auth-store";
import { settingsApi, type ConfigVersion } from "../../../src/features/settings/api";
import { pricingApi, type PositionCostRateVersion } from "../../../src/features/pricing/api";
import { orderApi, type PaymentAccountOption } from "../../../src/features/orders/api";
import { SettingsVersionEditor } from "../../../src/features/settings/settings-version-editor";

export default function FinanceSettingsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const storeId = user?.storeMember?.store.id;

  const [versions, setVersions] = useState<PositionCostRateVersion[]>([]);
  const [accounts, setAccounts] = useState<PaymentAccountOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (!storeId) return; Promise.all([pricingApi.positionCostRateVersions(storeId), orderApi.paymentAccounts(storeId)]).then(([rateVersions, paymentAccounts]) => { setVersions(rateVersions); setAccounts(paymentAccounts); }).catch((reason) => setError(reason instanceof Error ? reason.message : "财务配置加载失败")).finally(() => setLoading(false)); }, [storeId]);
  if (user?.isAuditor && !storeId) return <HeadquartersFinanceReadOnly onBack={() => router.push("/settings")} />;
  if (!storeId || loading) return <div className="management-page"><Spin tip="正在加载财务配置…" /></div>;
  return <div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}><Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/settings")}>返回职责工作台</Button><div><Typography.Title level={2}>财务结算</Typography.Title><Typography.Paragraph type="secondary">当前门店的岗位成本版本与收款账户。已发布成本版本不可直接修改，变更会创建新草稿。</Typography.Paragraph></div><SettingsVersionEditor capabilityCode="finance.settlement" domain="FINANCE" scopeId={storeId} title="成本与结算规则" description="实际入库价优先；缺失时按产品材料成本标准兜底；实际成本缺失时禁止确认，已完成结算的订单成本保持冻结。" fields={[{ key: "actualInboundPricePriority", label: "实际入库价优先", type: "boolean" }, { key: "standardMaterialFallback", label: "标准材料成本兜底", type: "boolean" }, { key: "missingCostPolicy", label: "成本缺失处理" }, { key: "commissionSource", label: "提成来源" }, { key: "settlementFreezeAfter", label: "结算冻结节点" }, { key: "adjustmentPolicy", label: "成本调整审批" }]} initial={{ actualInboundPricePriority: true, standardMaterialFallback: true, missingCostPolicy: "BLOCK_CONFIRMATION", commissionSource: "FINAL_WORKER_COMMISSION", settlementFreezeAfter: "SETTLED", adjustmentPolicy: "FINANCE_APPROVAL_ONLY" }} />{error ? <Alert type="error" showIcon message={error} /> : <><Card title={<Space><BankOutlined />岗位小时成本版本</Space>} extra={<Button onClick={() => router.push("/finance/material-costs")}>进入财务管理</Button>}>{versions.length ? <List dataSource={versions} renderItem={(version) => <List.Item><List.Item.Meta title={<Space>版本 v{version.version}<Tag color={version.status === "PUBLISHED" ? "green" : "gold"}>{version.status}</Tag></Space>} description={`生效：${version.effectiveFrom} · ${version.rates.length} 个岗位`} /></List.Item>} /> : <Empty description="暂无岗位小时成本版本" />}</Card><Card title="收款账户" extra={<Button onClick={() => router.push("/finance/accounts")}>维护收款账户</Button>}>{accounts.length ? <List dataSource={accounts} renderItem={(account) => <List.Item><List.Item.Meta title={account.name} description={`${account.type} · ${account.isActive ? "启用中" : "已停用"}`} /></List.Item>} /> : <Empty description="暂无收款账户" />}</Card></>}</Space></div>;
}

function HeadquartersFinanceReadOnly({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<ConfigVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([settingsApi.configVersions("finance.labor_cost"), settingsApi.configVersions("finance.accounts")]).then((sets) => setRows(sets.flatMap((set) => set.rows))).catch((reason) => setError(reason instanceof Error ? reason.message : "财务配置加载失败")).finally(() => setLoading(false)); }, []);
  return <div className="management-page settings-workspace"><Space direction="vertical" size={20} style={{ width: "100%" }}><Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回职责工作台</Button><Typography.Title level={2}>财务结算（总部只读）</Typography.Title>{loading ? <Spin tip="正在加载各门店财务版本…" /> : error ? <Alert type="error" showIcon message={error} /> : <List bordered dataSource={rows} locale={{ emptyText: "暂无财务配置版本" }} renderItem={(row) => <List.Item><List.Item.Meta title={<Space>{row.capabilityCode}<Tag>门店 {row.scopeId}</Tag><Tag color={row.status === "PUBLISHED" ? "green" : "gold"}>{row.status}</Tag></Space>} description={`版本 v${row.version} · ${row.updatedAt ?? "未记录更新时间"}`} /></List.Item>} />}</Space></div>;
}