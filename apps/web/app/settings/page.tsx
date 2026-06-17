"use client";

import type { ReactNode, RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Drawer, Space, Tag, Typography } from "antd";
import {
  AuditOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  LockOutlined,
  SettingOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { canAccessSystemSettings } from "../../src/features/settings/access";
import { StorePageHeader } from "../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../src/stores/auth-store";

type RoleCard = {
  name: string;
  type: "系统岗位" | "门店岗位";
  description: string;
  members: string;
  scopes: string[];
};

type PermissionLevel = "完全控制" | "部分权限" | "仅查看" | "无权限";
type SettingsSectionKey = "role" | "dictionary" | "store" | "account" | "service";

const SETTINGS_SECTION_NAV_ITEMS: Array<{ key: SettingsSectionKey; label: string; icon: ReactNode }> = [
  { key: "role", label: "角色权限", icon: <LockOutlined /> },
  { key: "dictionary", label: "基础字典", icon: <DatabaseOutlined /> },
  { key: "store", label: "门店配置", icon: <ShopOutlined /> },
  { key: "account", label: "账号设置", icon: <UserOutlined /> },
  { key: "service", label: "通知/OSS设置", icon: <CloudSyncOutlined /> }
];

const roles: RoleCard[] = [
  {
    name: "管理员",
    type: "系统岗位",
    description: "平台级审核与系统治理角色，负责门店审核、策略校准和审计追溯。",
    members: "系统配置",
    scopes: ["门店审核", "系统设置", "审计策略"]
  },
  {
    name: "店长",
    type: "系统岗位",
    description: "门店经营负责人，可管理成员、订单、施工、库存和财务闭环。",
    members: "1 人",
    scopes: ["成员管理", "报表分析", "财务审批"]
  },
  {
    name: "销售顾问",
    type: "门店岗位",
    description: "负责客户档案、订单创建、收款跟进和个人业绩查看。",
    members: "按门店配置",
    scopes: ["客户管理", "销售订单", "我的业绩"]
  },
  {
    name: "客服",
    type: "门店岗位",
    description: "负责客户档案维护、质保查询、售后受理和回访协同。",
    members: "按门店配置",
    scopes: ["客户档案", "质保查询", "售后受理"]
  },
  {
    name: "施工主管",
    type: "系统岗位",
    description: "负责施工容量、派单、质检和施工履约进度控制。",
    members: "按门店配置",
    scopes: ["施工容量", "派单", "质检"]
  },
  {
    name: "师傅",
    type: "门店岗位",
    description: "负责施工任务执行、照片上传、完工反馈和排班请假。",
    members: "按门店配置",
    scopes: ["施工任务", "照片上传", "请假排班"]
  },
  {
    name: "采购/库存",
    type: "门店岗位",
    description: "负责产品资料、库存匹配、采购入库和批次追溯。",
    members: "按门店配置",
    scopes: ["产品管理", "库存管理", "采购入库"]
  },
  {
    name: "财务",
    type: "门店岗位",
    description: "负责费用报销、收款账户、发票、返利和提成结算流程。",
    members: "按门店配置",
    scopes: ["财务流水", "发票返利", "提成结算"]
  }
];

const rolePermissionModules = ["客户", "销售单", "施工", "库存", "质保", "售后", "人员", "财务", "报表分析", "发票", "返利"] as const;

type RolePermissionMatrixRow = {
  role: string;
  permissions: Record<(typeof rolePermissionModules)[number], PermissionLevel>;
};

const rolePermissionMatrixRows: RolePermissionMatrixRow[] = [
  {
    role: "管理员",
    permissions: Object.fromEntries(rolePermissionModules.map((module) => [module, "完全控制"])) as RolePermissionMatrixRow["permissions"]
  },
  {
    role: "店长",
    permissions: {
      客户: "完全控制",
      销售单: "完全控制",
      施工: "完全控制",
      库存: "完全控制",
      质保: "完全控制",
      售后: "完全控制",
      人员: "完全控制",
      财务: "部分权限",
      报表分析: "完全控制",
      发票: "仅查看",
      返利: "部分权限"
    }
  },
  {
    role: "销售",
    permissions: {
      客户: "部分权限",
      销售单: "部分权限",
      施工: "仅查看",
      库存: "无权限",
      质保: "仅查看",
      售后: "部分权限",
      人员: "无权限",
      财务: "无权限",
      报表分析: "仅查看",
      发票: "无权限",
      返利: "无权限"
    }
  },
  {
    role: "客服",
    permissions: {
      客户: "完全控制",
      销售单: "仅查看",
      施工: "仅查看",
      库存: "部分权限",
      质保: "部分权限",
      售后: "完全控制",
      人员: "无权限",
      财务: "无权限",
      报表分析: "仅查看",
      发票: "无权限",
      返利: "部分权限"
    }
  },
  {
    role: "施工主管",
    permissions: {
      客户: "无权限",
      销售单: "仅查看",
      施工: "完全控制",
      库存: "仅查看",
      质保: "部分权限",
      售后: "仅查看",
      人员: "部分权限",
      财务: "无权限",
      报表分析: "无权限",
      发票: "无权限",
      返利: "无权限"
    }
  },
  {
    role: "师傅",
    permissions: {
      客户: "无权限",
      销售单: "无权限",
      施工: "部分权限",
      库存: "无权限",
      质保: "无权限",
      售后: "无权限",
      人员: "无权限",
      财务: "无权限",
      报表分析: "无权限",
      发票: "无权限",
      返利: "无权限"
    }
  },
  {
    role: "采购/库存",
    permissions: {
      客户: "无权限",
      销售单: "仅查看",
      施工: "无权限",
      库存: "完全控制",
      质保: "无权限",
      售后: "无权限",
      人员: "无权限",
      财务: "部分权限",
      报表分析: "仅查看",
      发票: "无权限",
      返利: "无权限"
    }
  },
  {
    role: "财务",
    permissions: {
      客户: "无权限",
      销售单: "仅查看",
      施工: "无权限",
      库存: "无权限",
      质保: "无权限",
      售后: "无权限",
      人员: "无权限",
      财务: "完全控制",
      报表分析: "仅查看",
      发票: "完全控制",
      返利: "完全控制"
    }
  }
];

const policyCards = [
  { icon: <DatabaseOutlined />, title: "基础字典", description: "施工类型、客户来源、产品分类和售后原因统一维护。", status: "配置待确认" },
  { icon: <ShopOutlined />, title: "门店配置", description: "门店资料、容量默认值、收款账户和业务开关集中配置。", status: "配置确认中" },
  { icon: <UserOutlined />, title: "账号设置", description: "登录账号、安全策略、个人资料和多端会话集中维护。", status: "跳转账号安全" },
  { icon: <CloudSyncOutlined />, title: "通知/OSS设置", description: "短信通知、OSS 上传、离线同步和文件归档策略。", status: "沿用环境配置" },
  { icon: <AuditOutlined />, title: "审计与安全", description: "关键操作审计、权限变更记录和敏感配置保护。", status: "审计已规划" }
];

const rolePolicySteps = ["确认岗位归属门店或系统级", "选择权限模板并收敛数据范围", "补齐岗位说明和审计原因", "由店长或管理员完成上线审批"];

const roleTemplatePreview = [
  { name: "销售扩展岗", scopes: ["客户读写", "订单创建", "收款跟进"], audit: "限制查看本门店客户与本人订单" },
  { name: "施工助理岗", scopes: ["任务只读", "照片上传", "请假排班"], audit: "不可派单、不可质检、不可修改订单金额" },
  { name: "库存协作岗", scopes: ["产品只读", "批次出入库", "采购需求"], audit: "批次操作必须保留来源单据" }
];

const dictionaryRows = [
  { name: "施工类型", code: "CONSTRUCTION_TYPE", items: "全车、局部、内饰", status: "启用中" },
  { name: "线索来源", code: "LEAD_SOURCE", items: "抖音、大众点评、转介绍", status: "启用中" },
  { name: "质保周期", code: "WARRANTY_PERIOD", items: "3年、5年、10年", status: "待审核" }
];

const quickSwitches = [
  { label: "施工全过程拍照", description: "开启后质保申请必传照片", enabled: true },
  { label: "短信自动提醒客户", description: "施工完成自动发送提醒", enabled: true },
  { label: "物料库存预警", description: "低于10%时邮件通知", enabled: false }
];

const levelClassName: Record<PermissionLevel, string> = {
  完全控制: "settings-permission-full",
  部分权限: "settings-permission-write",
  仅查看: "settings-permission-read",
  无权限: "settings-permission-none"
};

const levelSymbol: Record<PermissionLevel, string> = {
  完全控制: "●",
  部分权限: "◐",
  仅查看: "○",
  无权限: "—"
};

function PermissionBadge({ value }: { value: PermissionLevel }) {
  return (
    <span className={`settings-permission-badge settings-matrix-cell ${levelClassName[value]}`} title={value}>
      <b>{levelSymbol[value]}</b>
      <span>{value}</span>
    </span>
  );
}

function SettingsConfigurationBoard({
  dictionarySettingsSectionRef,
  serviceSettingsSectionRef
}: {
  dictionarySettingsSectionRef: RefObject<HTMLDivElement | null>;
  serviceSettingsSectionRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <section ref={dictionarySettingsSectionRef} className="settings-configuration-board">
      <Card className="settings-dictionary-card">
        <div className="settings-panel-heading settings-panel-heading-compact">
          <div>
            <Typography.Title level={3} className="settings-panel-title">
              基础字典配置
            </Typography.Title>
            <Typography.Text className="settings-panel-description">
              统一维护施工、线索、质保等核心枚举，当前以只读清单沉淀配置口径。
            </Typography.Text>
          </div>
          <Space size={8}>
            <Button>导出</Button>
            <Button type="primary">新增项</Button>
          </Space>
        </div>
        <div className="settings-dictionary-table">
          <table>
            <thead>
              <tr>
                <th>分类名称</th>
                <th>字典代码</th>
                <th>包含子项</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {dictionaryRows.map((row) => (
                <tr key={row.code}>
                  <td>{row.name}</td>
                  <td>
                    <code>{row.code}</code>
                  </td>
                  <td>{row.items}</td>
                  <td>
                    <Tag className={row.status === "启用中" ? "settings-status-success" : "settings-status-warning"}>{row.status}</Tag>
                  </td>
                  <td>
                    <Button type="link">编辑</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="settings-configuration-side">
        <Card className="settings-quick-switch-card">
          <Typography.Title level={3} className="settings-panel-title">
            快速开关
          </Typography.Title>
          <div className="settings-switch-list">
            {quickSwitches.map((item) => (
              <div key={item.label} className="settings-switch-row">
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.description}</span>
                </div>
                <span className={`settings-switch-pill${item.enabled ? " is-on" : ""}`} aria-label={item.enabled ? "已开启" : "未开启"} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="settings-system-status-card">
          <span>SYSTEM STATUS</span>
          <strong>核心引擎运行良好</strong>
          <p>99.9% Uptime</p>
        </Card>
      </div>

      <div ref={serviceSettingsSectionRef}>
        <Card className="settings-service-card">
          <div className="settings-service-heading">
            <span>
              <CloudSyncOutlined />
            </span>
            <div>
              <Typography.Title level={3} className="settings-panel-title">
                存储与通知服务 (OSS/SMTP)
              </Typography.Title>
              <Typography.Text className="settings-panel-description">
                配置用于附件存储和系统通知的基础设施，敏感值由环境变量托管。
              </Typography.Text>
            </div>
          </div>
          <div className="settings-service-grid">
            <label>
              <span>存储提供商</span>
              <select defaultValue="阿里云 OSS (推荐)" disabled>
                <option>阿里云 OSS (推荐)</option>
                <option>腾讯云 COS</option>
                <option>七牛云</option>
              </select>
            </label>
            <label>
              <span>Endpoint</span>
              <input value="oss-cn-shanghai.aliyuncs.com" disabled readOnly />
            </label>
            <label>
              <span>访问密钥标识</span>
              <input value="**************" disabled readOnly />
            </label>
            <label>
              <span>访问密钥密文</span>
              <input value="**************" disabled readOnly />
            </label>
            <label>
              <span>Bucket 名称</span>
              <input value="mallbay-pro-assets" disabled readOnly />
            </label>
            <label>
              <span>外链 CDN 域名</span>
              <input value="https://cdn.mallbay.com" disabled readOnly />
            </label>
          </div>
          <Button className="settings-service-test-button">测试连接</Button>
        </Card>
      </div>
    </section>
  );
}

function RolePermissionMatrixCard() {
  return (
    <Card className="settings-permission-card">
      <div className="settings-panel-heading settings-panel-heading-compact">
        <div>
          <Typography.Title level={3} className="settings-panel-title">
            权限矩阵
          </Typography.Title>
          <Typography.Text className="settings-panel-description">
            先以只读矩阵固化权限边界，确认权限边界后再开放策略调整与审计记录。
          </Typography.Text>
        </div>
        <div className="settings-matrix-legend" aria-label="权限等级图例">
          {(["完全控制", "部分权限", "仅查看", "无权限"] as PermissionLevel[]).map((level) => (
            <span key={level} className={levelClassName[level]}>
              <b>{levelSymbol[level]}</b>
              {level}
            </span>
          ))}
        </div>
      </div>
      <div className="settings-permission-matrix settings-role-permission-table">
        <table>
          <thead>
            <tr>
              <th>角色 \ 模块</th>
              {rolePermissionModules.map((module) => (
                <th key={module}>{module}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rolePermissionMatrixRows.map((row) => (
              <tr key={row.role}>
                <th>{row.role}</th>
                {rolePermissionModules.map((module) => (
                  <td key={module}>
                    <PermissionBadge value={row.permissions[module]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="settings-permission-mobile-cards">
        {rolePermissionMatrixRows.map((row) => (
          <article key={row.role} className="settings-permission-mobile-card">
            <div className="settings-permission-mobile-head">
              <strong>{row.role}</strong>
              <span>{rolePermissionModules.length} 个模块</span>
            </div>
            <div className="settings-permission-mobile-grid">
              {rolePermissionModules.map((module) => (
                <div key={module} className="settings-permission-mobile-item">
                  <span>{module}</span>
                  <PermissionBadge value={row.permissions[module]} />
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const canAccessSettings = canAccessSystemSettings({
    position: user?.storeMember?.position,
    isAuditor: user?.isAuditor
  });
  const [rolePolicyOpen, setRolePolicyOpen] = useState(false);
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionKey>("role");
  const roleSettingsSectionRef = useRef<HTMLDivElement | null>(null);
  const dictionarySettingsSectionRef = useRef<HTMLDivElement | null>(null);
  const storeSettingsSectionRef = useRef<HTMLDivElement | null>(null);
  const accountSettingsSectionRef = useRef<HTMLDivElement | null>(null);
  const serviceSettingsSectionRef = useRef<HTMLDivElement | null>(null);
  const settingsSectionRefs = useMemo(
    () => ({
      role: roleSettingsSectionRef,
      dictionary: dictionarySettingsSectionRef,
      store: storeSettingsSectionRef,
      account: accountSettingsSectionRef,
      service: serviceSettingsSectionRef
    }),
    []
  );
  const scrollSettingsSectionIntoView = useCallback(
    (sectionKey: SettingsSectionKey) => {
      setActiveSettingsSection(sectionKey);
      settingsSectionRefs[sectionKey].current?.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [settingsSectionRefs]
  );

  useEffect(() => {
    if (hasHydrated && !canAccessSettings) {
      router.replace("/dashboard");
    }
  }, [canAccessSettings, hasHydrated, router]);

  if (!hasHydrated || !canAccessSettings) {
    return null;
  }

  return (
    <div className="management-page settings-workspace">
      <StorePageHeader title="系统设置" description="统一维护岗位权限、门店配置、基础字典和系统安全边界">
        <Button icon={<TeamOutlined />} onClick={() => router.push("/members")}>
          人员管理
        </Button>
      </StorePageHeader>

      <section className="management-kpi-grid management-kpi-grid-five">
        {[
          ["岗位模型", "8", "覆盖门店全流程角色"],
          ["业务模块", "13", "原型侧边栏模块"],
          ["权限等级", "4", "完全/部分/查看/无"],
          ["审计策略", "启用", "关键变更留痕"],
          ["配置状态", "配置确认中", "权限边界按阶段确认"]
        ].map(([label, value, description]) => (
          <Card key={label} className="management-kpi-card">
            <div className="management-kpi-label">{label}</div>
            <div className="management-kpi-value">{value}</div>
            <div className="management-kpi-desc">{description}</div>
          </Card>
        ))}
      </section>

      <section className="settings-layout">
        <aside className="settings-section-nav">
          {SETTINGS_SECTION_NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={`settings-section-button${activeSettingsSection === item.key ? " settings-section-button-active" : ""}`}
              type="button"
              aria-pressed={activeSettingsSection === item.key}
              onClick={() => scrollSettingsSectionIntoView(item.key)}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </aside>

        <div className="settings-main-stack">
          <div ref={roleSettingsSectionRef}>
            <RolePermissionMatrixCard />
          </div>

          <SettingsConfigurationBoard
            dictionarySettingsSectionRef={dictionarySettingsSectionRef}
            serviceSettingsSectionRef={serviceSettingsSectionRef}
          />

          <Card className="management-filter-card settings-role-panel">
            <div className="settings-panel-heading">
              <div>
                <Typography.Title level={3} className="settings-panel-title">
                  岗位权限
                </Typography.Title>
                <Typography.Text className="settings-panel-description">
                  定义系统中不同岗位的操作权限与数据范围，避免业务页直接散落权限判断。
                </Typography.Text>
              </div>
              <Button type="primary" icon={<SettingOutlined />} onClick={() => setRolePolicyOpen(true)}>
                自定义新岗位
              </Button>
            </div>

            <div className="settings-role-grid">
              {roles.map((role) => (
                <article key={role.name} className="settings-role-card">
                  <div className="settings-role-card-top">
                    <Tag className="settings-role-type">{role.type}</Tag>
                    <span className="settings-role-members">{role.members}</span>
                  </div>
                  <Typography.Title level={4} className="settings-role-name">
                    {role.name}
                  </Typography.Title>
                  <p className="settings-role-description">{role.description}</p>
                  <Space wrap size={[6, 6]}>
                    {role.scopes.map((scope) => (
                      <Tag key={scope} className="settings-scope-tag">
                        {scope}
                      </Tag>
                    ))}
                  </Space>
                </article>
              ))}
            </div>
          </Card>

          <div className="settings-policy-grid">
            <div ref={storeSettingsSectionRef} className="settings-section-anchor" />
            <div ref={accountSettingsSectionRef} className="settings-section-anchor" />
            {policyCards.map((card) => (
              <Card key={card.title} className="settings-policy-card">
                <div className="settings-policy-icon">{card.icon}</div>
                <div>
                  <Typography.Title level={4} className="settings-policy-title">
                    {card.title}
                  </Typography.Title>
                  <p className="settings-policy-description">{card.description}</p>
                  <Tag className="settings-policy-status">{card.status}</Tag>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <Drawer
        open={rolePolicyOpen}
        title="岗位策略草案"
        placement="right"
        onClose={() => setRolePolicyOpen(false)}
        rootClassName="settings-policy-drawer"
        destroyOnHidden
        footer={
          <div className="settings-policy-drawer-footer">
            <Button onClick={() => setRolePolicyOpen(false)}>关闭</Button>
            <Button type="primary" icon={<TeamOutlined />} onClick={() => router.push("/members")}>
              前往人员管理
            </Button>
          </div>
        }
      >
        <div className="settings-policy-drawer-body">
          <section className="settings-policy-drawer-card settings-policy-drawer-hero">
            <Tag className="settings-policy-status">策略确认中</Tag>
            <Typography.Title level={4}>先确认权限策略，再开放岗位创建</Typography.Title>
            <p>
              当前系统已固化店长、销售、施工主管、采购库存和财务等基础岗位。新增岗位必须先复用这些模板，避免业务页面出现临时权限判断。
            </p>
          </section>

          <section className="settings-policy-drawer-card">
            <Typography.Title level={5}>创建前置规则</Typography.Title>
            <div className="settings-policy-step-list">
              {rolePolicySteps.map((step, index) => (
                <div key={step} className="settings-policy-step">
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="settings-policy-drawer-card">
            <Typography.Title level={5}>默认权限模板</Typography.Title>
            <div className="settings-role-template-list">
              {roleTemplatePreview.map((template) => (
                <article key={template.name} className="settings-role-template-card">
                  <div>
                    <h4>{template.name}</h4>
                    <p>{template.audit}</p>
                  </div>
                  <Space wrap size={[6, 6]}>
                    {template.scopes.map((scope) => (
                      <Tag key={scope} className="settings-scope-tag">
                        {scope}
                      </Tag>
                    ))}
                  </Space>
                </article>
              ))}
            </div>
          </section>

          <section className="settings-policy-drawer-card">
            <Typography.Title level={5}>必须保留的审计信息</Typography.Title>
            <div className="settings-audit-note-grid">
              {["创建人", "审批人", "权限变更原因", "生效门店", "生效时间", "回滚方案"].map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          </section>
        </div>
      </Drawer>
    </div>
  );
}
