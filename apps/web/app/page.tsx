"use client";

import {
  App,
  Avatar,
  Button,
  Dropdown,
  Empty,
  Input,
  Layout,
  Pagination,
  Skeleton,
  Tag,
  Typography
} from "antd";
import {
  AuditOutlined,
  EnvironmentOutlined,
  SearchOutlined,
  ShopOutlined,
  TeamOutlined,
  UserOutlined
} from "@ant-design/icons";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { authApi, storeApi } from "../src/lib/api";
import { useAuthStore } from "../src/stores/auth-store";
import { NotificationBell } from "../src/components/NotificationBell";

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长", SALES: "销售", PURCHASING: "采购",
  FINANCE: "财务", SCHEDULER: "排班员", CONSTRUCTION: "施工员", APPRENTICE: "学徒"
};

// ─── 门店卡片 ─────────────────────────────────────────────────────
function StoreCard({ store }: { store: { id: string; name: string; address: string | null; description: string | null; coverUrl: string | null } }) {
  const router = useRouter();
  return (
    <div
      className="store-card"
      onClick={() => router.push(`/stores/${store.id}`)}
    >
      <div className="store-card-cover">
        {store.coverUrl ? (
          <img src={store.coverUrl} alt={store.name} className="store-card-img" />
        ) : (
          <div className="store-card-placeholder">
            <ShopOutlined style={{ fontSize: 32, color: "#cbd5e1" }} />
          </div>
        )}
      </div>
      <div className="store-card-body">
        <div className="store-card-name">{store.name}</div>
        {store.address && (
          <div className="store-card-address">
            <EnvironmentOutlined className="mr-1 text-slate-400" />
            {store.address}
          </div>
        )}
        {store.description && (
          <div className="store-card-desc">{store.description}</div>
        )}
      </div>
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────
export default function HomePage() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);
  const router = useRouter();
  const { message } = App.useApp();

  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);

  // 拉取最新用户信息（含 storeMember）
  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    enabled: hasHydrated && !!user,
    staleTime: 0          // 每次挂载都重新拉，保证 storeMember 始终最新
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

  // 公开门店列表
  const storesQuery = useQuery({
    queryKey: ["stores", query, page],
    queryFn: () => storeApi.list({ q: query || undefined, page, pageSize: 12 }),
    staleTime: 30_000
  });

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearSession();
      message.success("已退出登录");
    }
  });

  const handleSearch = () => {
    setPage(1);
    setQuery(search.trim());
  };

  const isLoggedIn = hasHydrated && !!user?.username;
  const displayName = user ? (user.nickname ?? user.username) : "";
  const storeMember = user?.storeMember;

  // 右上角下拉菜单项
  const dropdownItems = [
    // 运营入口
    ...(user?.isAuditor ? [{
      key: "auditor",
      label: (
        <span className="flex items-center gap-2">
          <AuditOutlined />
          运营管理
        </span>
      ),
      onClick: () => router.push("/admin")
    }] : []),
    // 门店员工入口
    ...(storeMember ? [{
      key: "workbench",
      label: (
        <span className="flex items-center gap-2">
          <TeamOutlined />
          <span>
            {storeMember.store.name}
            <span className="ml-1 text-xs text-slate-400">
              · {POSITION_LABEL[storeMember.position] ?? storeMember.position}
            </span>
          </span>
        </span>
      ),
      onClick: () => router.push(`/workbench/${storeMember.store.id}`)
    }] : []),
    // 分割线（有角色入口时）
    ...((user?.isAuditor || storeMember) ? [{ type: "divider" as const }] : []),
    { key: "profile", label: "个人设置", icon: <UserOutlined />, onClick: () => router.push("/profile") },
    { type: "divider" as const },
    {
      key: "logout",
      label: "退出登录",
      danger: true,
      onClick: () => logoutMutation.mutate()
    }
  ];

  return (
    <Layout className="home-shell">
      {/* Header */}
      <header className="home-header">
        <div className="home-brand" onClick={() => router.push("/")}>
          <Typography.Title level={4} className="!mb-0 !text-slate-950 cursor-pointer">
            MallBay
          </Typography.Title>
        </div>

        <div className="home-search">
          <Input
            prefix={<SearchOutlined className="text-slate-400" />}
            placeholder="搜索门店名称或地址"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onPressEnter={handleSearch}
            allowClear
            onClear={() => { setSearch(""); setQuery(""); setPage(1); }}
          />
        </div>

        <div className="home-header-right">
          {isLoggedIn && (
            <NotificationBell onJoined={() => queryClient.invalidateQueries({ queryKey: ["me"] })} />
          )}
          {!hasHydrated ? null : isLoggedIn ? (
            <Dropdown menu={{ items: dropdownItems }} placement="bottomRight" trigger={["click"]}>
              <button className="dashboard-avatar-btn" aria-label="菜单">
                {user?.avatarUrl ? (
                  <Avatar src={user.avatarUrl} size={36} />
                ) : (
                  <Avatar size={36} style={{ background: "#1677ff", cursor: "pointer" }}>
                    {displayName.charAt(0).toUpperCase()}
                  </Avatar>
                )}
              </button>
            </Dropdown>
          ) : (
            <Button type="primary" onClick={() => router.push("/auth")}>
              登录 / 注册
            </Button>
          )}
        </div>
      </header>

      {/* 搜索结果提示 */}
      {query && (
        <div className="home-search-tip">
          <Typography.Text className="text-slate-500 text-sm">
            搜索「{query}」，共 {storesQuery.data?.total ?? 0} 个结果
          </Typography.Text>
          <Button type="link" size="small" onClick={() => { setSearch(""); setQuery(""); setPage(1); }}>
            清除
          </Button>
        </div>
      )}

      {/* 门店列表 */}
      <Layout.Content className="home-content">
        {storesQuery.isLoading ? (
          <div className="store-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} active className="store-card-skeleton" />
            ))}
          </div>
        ) : storesQuery.data?.items.length === 0 ? (
          <Empty description={query ? "没有找到匹配的门店" : "暂无公开门店"} className="mt-20" />
        ) : (
          <>
            <div className="store-grid">
              {storesQuery.data?.items.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
            {(storesQuery.data?.total ?? 0) > 12 && (
              <div className="home-pagination">
                <Pagination
                  current={page}
                  total={storesQuery.data?.total ?? 0}
                  pageSize={12}
                  onChange={(p) => setPage(p)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </>
        )}
      </Layout.Content>
    </Layout>
  );
}
