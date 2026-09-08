"use client";

import {
  App,
  Avatar,
  Button,
  Dropdown,
  Empty,
  Input,
  Pagination,
  Skeleton,
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { authApi, storeApi } from "../src/lib/api";
import { NotificationBell } from "../src/components/NotificationBell";
import { useAuthStore } from "../src/stores/auth-store";
import { hasEffectivePermission, useEffectivePermissions } from "../src/features/permissions/use-effective-permissions";

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长",
  SALES: "销售",
  PURCHASING: "采购",
  FINANCE: "财务",
  SCHEDULER: "排班员",
  CONSTRUCTION: "施工员",
  APPRENTICE: "学徒"
};

type StoreLobbyCardProps = {
  store: {
    id: string;
    name: string;
    address: string | null;
    description: string | null;
    coverUrl: string | null;
  };
};

function StoreLobbyCard({ store }: StoreLobbyCardProps) {
  const router = useRouter();

  return (
    <button className="store-lobby-card" type="button" onClick={() => router.push(`/stores/${store.id}`)}>
      <div className="store-lobby-cover">
        {store.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={store.coverUrl} alt={store.name} />
        ) : (
          <div className="store-lobby-cover-placeholder">
            <ShopOutlined />
          </div>
        )}
      </div>
      <div className="store-lobby-card-body">
        <div className="store-lobby-card-kicker">认证服务门店</div>
        <h2>{store.name}</h2>
        {store.address && (
          <p className="store-lobby-card-address">
            <EnvironmentOutlined />
            <span>{store.address}</span>
          </p>
        )}
        <p className="store-lobby-card-desc">{store.description ?? "门店暂未填写简介，点击查看公开资料。"}</p>
        <div className="store-lobby-card-meta">
          <span>认证技师: 已认证团队</span>
          <span>工位: 以门店详情为准</span>
        </div>
      </div>
    </button>
  );
}

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
  const permissionsQuery = useEffectivePermissions();
  const canAccessOperations = hasEffectivePermission(permissionsQuery.data?.permissions, "permissions.policy", "read");

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: authApi.me,
    enabled: hasHydrated && Boolean(user),
    staleTime: 0
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

  const clearSearch = () => {
    setSearch("");
    setQuery("");
    setPage(1);
  };

  const isLoggedIn = hasHydrated && Boolean(user?.username);
  const displayName = user ? (user.nickname ?? user.username) : "";
  const storeMember = user?.storeMember;

  const dropdownItems = [
    ...(canAccessOperations
      ? [
          {
            key: "auditor",
            label: (
              <span className="home-lobby-menu-item">
                <AuditOutlined />
                运营管理
              </span>
            ),
            onClick: () => router.push("/admin")
          }
        ]
      : []),
    ...(storeMember
      ? [
          {
            key: "workbench",
            label: (
              <span className="home-lobby-menu-item">
                <TeamOutlined />
                <span>
                  {storeMember.store.name}
                  <small className="home-lobby-menu-meta">
                    · {POSITION_LABEL[storeMember.position] ?? storeMember.position}
                  </small>
                </span>
              </span>
            ),
            onClick: () => router.push(`/workbench/${storeMember.store.id}`)
          }
        ]
      : []),
    ...((canAccessOperations || storeMember) ? [{ type: "divider" as const }] : []),
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
    <main className="home-lobby-shell">
      <header className="home-lobby-topbar">
        <button className="home-lobby-brand" type="button" onClick={() => router.push("/")}>
          <span>mallbay</span>
          <small>门店运营系统</small>
        </button>

        <div className="home-lobby-actions">
          {isLoggedIn && <NotificationBell onJoined={() => queryClient.invalidateQueries({ queryKey: ["me"] })} />}
          {!hasHydrated ? null : isLoggedIn ? (
            <Dropdown menu={{ items: dropdownItems }} placement="bottomRight" trigger={["click"]}>
              <button className="dashboard-avatar-btn" aria-label="菜单">
                {user?.avatarUrl ? (
                  <Avatar src={user.avatarUrl} size={36} />
                ) : (
                  <Avatar size={36} style={{ background: "var(--mb-primary)", cursor: "pointer" }}>
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

      <section className="home-lobby-hero">
        <div>
          <div className="home-lobby-kicker">
            <span />
            门店大厅
          </div>
          <Typography.Title className="home-lobby-title">
            查找可信赖的漆面保护膜服务门店
          </Typography.Title>
          <Typography.Paragraph className="home-lobby-subtitle">
            浏览公开门店资料，进入门店详情查看地址、照片和服务状态；员工可从右上角快速进入自己的门店工作台。
          </Typography.Paragraph>
        </div>

        <div className="home-lobby-toolbar">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索门店名称或地址"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onPressEnter={handleSearch}
            allowClear
            onClear={clearSearch}
          />
          <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
            搜索门店
          </Button>
        </div>
      </section>

      {query && (
        <section className="home-lobby-query">
          <span>搜索「{query}」，共 {storesQuery.data?.total ?? 0} 个结果</span>
          <Button type="link" size="small" onClick={clearSearch}>
            清除
          </Button>
        </section>
      )}

      <section className="home-lobby-store-section">
        <div className="home-lobby-section-head">
          <div>
            <span>公开服务网络</span>
            <h2>认证服务门店</h2>
          </div>
          <Typography.Text>{storesQuery.data?.total ?? 0} 家</Typography.Text>
        </div>

        {storesQuery.isLoading ? (
          <div className="store-lobby-grid">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} active className="store-lobby-skeleton" />
            ))}
          </div>
        ) : storesQuery.data?.items.length === 0 ? (
          <div className="home-lobby-empty">
            <Empty description={query ? "没有找到匹配的门店" : "暂无公开门店"} />
          </div>
        ) : (
          <>
            <div className="store-lobby-grid">
              {storesQuery.data?.items.map((store) => (
                <StoreLobbyCard key={store.id} store={store} />
              ))}
            </div>
            {(storesQuery.data?.total ?? 0) > 12 && (
              <div className="home-lobby-pagination">
                <Pagination
                  current={page}
                  total={storesQuery.data?.total ?? 0}
                  pageSize={12}
                  onChange={(nextPage) => setPage(nextPage)}
                  showSizeChanger={false}
                />
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
