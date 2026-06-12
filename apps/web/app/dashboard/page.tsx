"use client";

import { App, Avatar, Button, Dropdown, Input, Layout, Modal, Form, Typography, Tag, Spin } from "antd";
import { PlusOutlined, ShopOutlined, TeamOutlined, UserOutlined, SearchOutlined } from "@ant-design/icons";
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

// ─── 管理员：创建门店 Modal ───────────────────────────────────────
function CreateStoreModal({ open, onClose }: { open: boolean; onClose: () => void }) {
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
    <Modal
      open={open}
      title="创建门店"
      onCancel={handleClose}
      onOk={() => createMutation.mutate()}
      okText="创建"
      cancelText="取消"
      okButtonProps={{
        disabled: !storeName.trim() || !selectedUser,
        loading: createMutation.isPending
      }}
      destroyOnHidden
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
            prefix={<SearchOutlined className="text-slate-400" />}
            value={keyword}
            onChange={(e) => { setKeyword(e.target.value); setSelectedUser(null); }}
            placeholder="搜索用户名"
            allowClear
          />
          {searchQuery.isFetching && <Spin size="small" className="mt-2 block" />}
          {searchQuery.data && searchQuery.data.length > 0 && !selectedUser && (
            <div className="mt-1 rounded border border-slate-200 bg-white shadow-sm">
              {searchQuery.data.map((u) => (
                <div
                  key={u.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 hover:bg-slate-50"
                  onClick={() => { setSelectedUser(u); setKeyword(u.username); }}
                >
                  <Avatar size={24} style={{ background: "#1677ff", fontSize: 12 }}>
                    {(u.nickname ?? u.username).charAt(0).toUpperCase()}
                  </Avatar>
                  <span className="font-mono text-sm">{u.username}</span>
                  {u.nickname && <span className="text-slate-400 text-sm">{u.nickname}</span>}
                </div>
              ))}
            </div>
          )}
          {selectedUser && (
            <div className="mt-2 flex items-center gap-2 rounded bg-blue-50 px-3 py-2 text-sm">
              <Avatar size={20} style={{ background: "#1677ff", fontSize: 10 }}>
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
    </Modal>
  );
}

// ─── 主页面 ──────────────────────────────────────────────────────
export default function DashboardPage() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const router = useRouter();

  const [createStoreOpen, setCreateStoreOpen] = useState(false);

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearSession();
      router.push("/auth");
    }
  });

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
  const avatarLabel = displayName.charAt(0).toUpperCase();
  const storeMember = user.storeMember;

  return (
    <Layout className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Typography.Title level={4} className="!mb-0 truncate !text-slate-950">
            MallBay
          </Typography.Title>
        </div>

        <Dropdown
          menu={{
            items: [
              { key: "profile", label: "个人设置", onClick: () => router.push("/profile") },
              { type: "divider" },
              { key: "logout", label: "退出登录", danger: true, onClick: () => logoutMutation.mutate() }
            ]
          }}
          placement="bottomRight"
          trigger={["click"]}
        >
          <button className="dashboard-avatar-btn" aria-label="个人设置">
            {user.avatarUrl ? (
              <Avatar src={user.avatarUrl} size={36} />
            ) : (
              <Avatar size={36} style={{ background: "#1677ff", cursor: "pointer" }}>
                {avatarLabel}
              </Avatar>
            )}
          </button>
        </Dropdown>
      </header>

      <Layout.Content className="dashboard-content">
        <div className="mb-6">
          <Typography.Title level={3} className="!mb-1">
            你好，{displayName}
          </Typography.Title>
          <Typography.Text className="text-slate-500 text-sm font-mono">{user.username}</Typography.Text>
        </div>

        <div className="dashboard-card-grid">
          {/* 管理员模块 */}
          {user.isAuditor && (
            <div className="dashboard-section-card">
              <div className="dashboard-section-header">
                <div className="dashboard-section-icon">
                  <ShopOutlined />
                </div>
                <div>
                  <div className="dashboard-section-title">运营管理</div>
                  <div className="dashboard-section-desc">管理员工作台</div>
                </div>
              </div>
              <div className="dashboard-section-actions">
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setCreateStoreOpen(true)}
                  block
                >
                  创建门店
                </Button>
                <Button block onClick={() => router.push("/admin/stores")}>
                  门店管理
                </Button>
              </div>
            </div>
          )}

          {/* 门店员工模块 */}
          {storeMember ? (
            <div className="dashboard-section-card">
              <div className="dashboard-section-header">
                <div className="dashboard-section-icon">
                  <TeamOutlined />
                </div>
                <div>
                  <div className="dashboard-section-title">{storeMember.store.name}</div>
                  <div className="dashboard-section-desc flex items-center gap-2">
                    <span>{POSITION_LABEL[storeMember.position] ?? storeMember.position}</span>
                    <Tag color={STATUS_CONFIG[storeMember.store.status]?.color} className="!text-xs">
                      {STATUS_CONFIG[storeMember.store.status]?.text}
                    </Tag>
                  </div>
                </div>
              </div>
              <Button type="primary" block onClick={() => router.push(`/workbench/${storeMember.store.id}`)}>
                进入工作台
              </Button>
            </div>
          ) : (
            <div className="dashboard-section-card">
              <div className="dashboard-section-header">
                <div className="dashboard-section-icon">
                  <TeamOutlined />
                </div>
                <div>
                  <div className="dashboard-section-title" style={{ color: "#94a3b8" }}>暂无门店</div>
                  <div className="dashboard-section-desc">等待店长邀请后即可加入</div>
                </div>
              </div>
              <Button block disabled>工作台</Button>
            </div>
          )}

          {/* 客户模块 */}
          <div className="dashboard-section-card">
            <div className="dashboard-section-header">
              <div className="dashboard-section-icon">
                <UserOutlined />
              </div>
              <div>
                <div className="dashboard-section-title">客户中心</div>
                <div className="dashboard-section-desc">门店、消费记录、会员权益</div>
              </div>
            </div>
            <Button block onClick={() => router.push("/stores")}>
              浏览门店
            </Button>
          </div>
        </div>
      </Layout.Content>

      <CreateStoreModal open={createStoreOpen} onClose={() => setCreateStoreOpen(false)} />
    </Layout>
  );
}
