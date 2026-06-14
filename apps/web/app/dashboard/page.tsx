"use client";

import { App, Avatar, Button, Card, Drawer, Input, Form, Typography, Tag, Spin } from "antd";
import {
  ArrowRightOutlined,
  AuditOutlined,
  PlusOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi, storeApi, userApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长",
  SALES: "销售",
  PURCHASING: "采购",
  FINANCE: "财务",
  SCHEDULER: "排班员",
  CONSTRUCTION: "施工员",
  APPRENTICE: "学徒"
};

const STATUS_CONFIG: Record<string, { text: string; color: string }> = {
  DRAFTED: { text: "筹办中", color: "default" },
  PENDING_REVIEW: { text: "审核中", color: "processing" },
  PUBLISHED: { text: "公开", color: "success" },
  FROZEN: { text: "已冻结", color: "warning" }
};

// ─── 管理员：创建门店 Drawer ───────────────────────────────────────
function CreateStoreDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { message } = App.useApp();
  const [keyword, setKeyword] = useState("");
  const [selectedUser, setSelectedUser] = useState<{ id: string; username: string; nickname: string | null } | null>(null);
  const [storeName, setStoreName] = useState("");

  const searchQuery = useQuery({
    queryKey: ["user-search", keyword],
    queryFn: () => userApi.searchUsers(keyword),
    enabled: keyword.trim().length > 0
  });

  const createMutation = useMutation({
    mutationFn: () => storeApi.create({ name: storeName, managerId: selectedUser!.id }),
    onSuccess: () => {
      message.success("门店创建成功");
      setStoreName("");
      setKeyword("");
      setSelectedUser(null);
      onClose();
    },
    onError: (e: Error) => message.error(e.message)
  });

  const handleClose = () => {
    setStoreName("");
    setKeyword("");
    setSelectedUser(null);
    onClose();
  };

  return (
    <Drawer
      open={open}
      title="创建门店"
      onClose={handleClose}
      placement="right"
      rootClassName="dashboard-create-store-drawer"
      destroyOnHidden
      footer={(
        <div className="dashboard-create-store-drawer-footer">
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            disabled={!storeName.trim() || !selectedUser}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            创建
          </Button>
        </div>
      )}
    >
      <Form layout="vertical" className="mt-4">
        <Form.Item label="门店名称" required>
          <Input
            value={storeName}
            onChange={(e) => setStoreName(e.target.value)}
            maxLength={50}
            showCount
            placeholder="请输入门店名称"
          />
        </Form.Item>

        <Form.Item label="指派店长" required>
          <Input
            prefix={<SearchOutlined />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelectedUser(null); }}
            placeholder="搜索用户名"
            allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.data && searchQuery.data.length > 0 && !selectedUser && (
            <div className="dashboard-user-search-results">
              {searchQuery.data.map((u) => (
                <div
                  key={u.id}
                  className="dashboard-user-search-row"
                  onClick={() => { setSelectedUser(u); setKeyword(u.username); }}
                >
                  <Avatar size={24} style={{ background: "var(--mb-primary)", fontSize: 12 }}>
                    {(u.nickname ?? u.username).charAt(0).toUpperCase()}
                  </Avatar>
                  <span className="font-mono text-sm">{u.username}</span>
                  {u.nickname && <span className="management-kpi-desc">{u.nickname}</span>}
                </div>
              ))}
            </div>
          )}
          {selectedUser && (
            <div className="management-filter-card mt-2 flex items-center gap-2 !p-3 text-sm">
              <Avatar size={20} style={{ background: "var(--mb-primary)", fontSize: 10 }}>
                {(selectedUser.nickname ?? selectedUser.username).charAt(0).toUpperCase()}
              </Avatar>
              <span>已选择：<span className="font-mono">{selectedUser.username}</span></span>
              <Button type="link" size="small" danger onClick={() => { setSelectedUser(null); setKeyword(""); }}>
                重选
              </Button>
            </div>
          )}
        </Form.Item>
      </Form>
    </Drawer>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const router = useRouter();

  const [createStoreOpen, setCreateStoreOpen] = useState(false);

  // 拉取最新用户信息（含 storeMember）
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    enabled: hasHydrated && !!user,
    staleTime: 30_000
  });

  useEffect(() => {
    if (meQuery.data) {
      const store = useAuthStore.getState();
      setSession({
        user: meQuery.data,
        accessToken: store.accessToken!,
        refreshToken: store.refreshToken!
      });
    }
  }, [meQuery.data, setSession]);

  useEffect(() => {
    if (hasHydrated && (!user || !user.username)) router.push("/auth");
  }, [hasHydrated, router, user]);

  if (!hasHydrated || !user || !user.username) return null;

  const displayName = user.nickname ?? user.username;
  const storeMember = user.storeMember;
  const roleLabel = storeMember
    ? POSITION_LABEL[storeMember.position] ?? storeMember.position
    : user.isAuditor
      ? "管理员"
      : "访客";
  const storeStatus = storeMember ? STATUS_CONFIG[storeMember.store.status] : undefined;
  const metrics = [
    {
      label: "当前门店",
      value: storeMember?.store.name ?? "暂无门店",
      description: storeMember ? roleLabel : "等待店长邀请"
    },
    {
      label: "门店状态",
      value: storeMember ? storeStatus?.text ?? storeMember.store.status : "-",
      description: "运营访问状态"
    },
    {
      label: "系统权限",
      value: user.isAuditor ? "管理员" : storeMember ? "门店成员" : "访客",
      description: "按角色展示菜单"
    },
    {
      label: "个人中心",
      value: displayName,
      description: "资料、密码与账号绑定"
    }
  ];

  return (
    <div className="management-page dashboard-entry-workspace">
      <section className="dashboard-entry-hero">
        <div className="dashboard-entry-hero-copy">
          <Tag className="dashboard-entry-kicker">账号入口</Tag>
          <Typography.Title level={2} className="management-page-title">
            你好，{displayName}
          </Typography.Title>
          <Typography.Paragraph className="management-page-description">
            选择门店运营、客户浏览或系统审核入口。当前账号会按角色自动展示可用功能。
          </Typography.Paragraph>
          <div className="dashboard-entry-actions">
            {storeMember ? (
              <Button
                type="primary"
                icon={<ArrowRightOutlined />}
                onClick={() => router.push(`/workbench/${storeMember.store.id}`)}
              >
                进入工作台
              </Button>
            ) : (
              <Button disabled>等待门店邀请</Button>
            )}
            <Button onClick={() => router.push("/profile")}>账号安全</Button>
          </div>
        </div>

        <Card className="dashboard-account-card">
          <div className="dashboard-account-main">
            <Avatar size={58} icon={<UserOutlined />} style={{ background: "var(--mb-primary)" }}>
              {displayName.charAt(0).toUpperCase()}
            </Avatar>
            <div>
              <Typography.Title level={4}>{displayName}</Typography.Title>
              <Typography.Text>{user.username}</Typography.Text>
            </div>
          </div>
          <div className="dashboard-account-tags">
            <Tag color={user.isAuditor ? "processing" : undefined}>{roleLabel}</Tag>
            {storeMember ? (
              <Tag color={storeStatus?.color}>{storeStatus?.text ?? storeMember.store.status}</Tag>
            ) : (
              <Tag>未加入门店</Tag>
            )}
          </div>
        </Card>
      </section>

      <section className="dashboard-entry-metrics">
        {metrics.map((item) => (
          <Card key={item.label} className="management-kpi-card dashboard-entry-metric-card">
            <div className="management-kpi-label">{item.label}</div>
            <div className="management-kpi-value">{item.value}</div>
            <div className="management-kpi-desc">{item.description}</div>
          </Card>
        ))}
      </section>

      <section className="dashboard-entry-grid">
        <Card className="dashboard-action-card dashboard-store-card">
          <div className="dashboard-action-card-head">
            <span className="dashboard-action-icon"><TeamOutlined /></span>
            <div>
              <Typography.Title level={4}>{storeMember ? storeMember.store.name : "门店工作台"}</Typography.Title>
              <Typography.Text>客户、订单、施工、库存和报表统一入口</Typography.Text>
            </div>
          </div>
          <div className="dashboard-action-card-body">
            {storeMember ? (
              <div className="detail-status-strip">
                <Tag>{roleLabel}</Tag>
                <Tag color={storeStatus?.color}>{storeStatus?.text}</Tag>
              </div>
            ) : (
              <Typography.Paragraph type="secondary">
                当前账号还没有加入门店，等待店长邀请后即可使用门店业务功能。
              </Typography.Paragraph>
            )}
            <Button
              type="primary"
              block
              disabled={!storeMember}
              onClick={() => storeMember && router.push(`/workbench/${storeMember.store.id}`)}
            >
              {storeMember ? "进入工作台" : "等待门店邀请"}
            </Button>
          </div>
        </Card>

        {user.isAuditor ? (
          <Card className="dashboard-action-card dashboard-auditor-panel">
            <div className="dashboard-action-card-head">
              <span className="dashboard-action-icon"><AuditOutlined /></span>
              <div>
                <Typography.Title level={4}>总部审核</Typography.Title>
                <Typography.Text>创建门店、审核门店资料并处理运营权限</Typography.Text>
              </div>
            </div>
            <div className="dashboard-action-button-row">
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateStoreOpen(true)}>
                创建门店
              </Button>
              <Button onClick={() => router.push("/admin")}>门店审核</Button>
            </div>
          </Card>
        ) : null}

        <Card className="dashboard-action-card dashboard-quick-links">
          <div className="dashboard-action-card-head">
            <span className="dashboard-action-icon"><ShopOutlined /></span>
            <div>
              <Typography.Title level={4}>客户入口</Typography.Title>
              <Typography.Text>浏览公开门店、消费记录和会员权益入口</Typography.Text>
            </div>
          </div>
          <div className="dashboard-action-button-row">
            <Button block onClick={() => router.push("/stores")}>浏览门店</Button>
            <Button block onClick={() => router.push("/profile")}>个人中心</Button>
          </div>
        </Card>
      </section>

      <CreateStoreDrawer open={createStoreOpen} onClose={() => setCreateStoreOpen(false)} />
    </div>
  );
}
