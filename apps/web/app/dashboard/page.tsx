"use client";

import { App, Avatar, Button, Card, Dropdown, Layout, Tag, Typography } from "antd";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { authApi } from "../../src/lib/api";
import { useAuthStore } from "../../src/stores/auth-store";

export default function DashboardPage() {
  const hasHydrated = useAuthStore((state) => state.hasHydrated);
  const user = useAuthStore((state) => state.user);
  const clearSession = useAuthStore((state) => state.clearSession);
  const router = useRouter();
  const { message } = App.useApp();

  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      clearSession();
      message.success("已退出登录");
      router.push("/auth");
    }
  });

  useEffect(() => {
    // 未登录，或 session 是旧格式（无 username 字段）均跳回登录页
    if (hasHydrated && (!user || !user.username)) {
      router.push("/auth");
    }
  }, [hasHydrated, router, user]);

  if (!hasHydrated || !user || !user.username) {
    return null;
  }

  const displayName = user.nickname ?? user.username;
  const avatarLabel = displayName.charAt(0).toUpperCase();
  const roleText = user.role === "CUSTOMER" ? "客户" : "工作人员";

  const sections = [
    {
      title: "客户视角",
      desc: "查看消费记录、会员权益和可用优惠。",
      status: user.role === "CUSTOMER" ? "当前" : "可切换",
      tone: "blue"
    },
    {
      title: "工作人员视角",
      desc: "处理门店任务、会员服务和订单协作。",
      status: user.role === "STAFF" ? "当前" : "待邀请",
      tone: "green"
    },
    {
      title: "门店成员",
      desc: "后续由店长邀请员工、调整角色或移除成员。",
      status: "规划中",
      tone: "gold"
    }
  ];

  return (
    <Layout className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <Typography.Title level={4} className="!mb-0 truncate !text-slate-950">
            MallBay
          </Typography.Title>
          <Typography.Text className="text-xs text-slate-500 sm:text-sm">门店 SaaS 工作台</Typography.Text>
        </div>

        <Dropdown
          menu={{
            items: [
              {
                key: "profile",
                label: "个人设置",
                onClick: () => router.push("/profile")
              },
              { type: "divider" },
              {
                key: "logout",
                label: "退出登录",
                danger: true,
                onClick: () => logoutMutation.mutate()
              }
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
        <section className="dashboard-hero-grid">
          <div className="dashboard-hero">
            <div className="dashboard-hero-row">
              <div>
                <Tag color={user.role === "CUSTOMER" ? "blue" : "green"} className="!mb-3">
                  当前身份：{roleText}
                </Tag>
                <Typography.Title className="dashboard-title">
                  {displayName}，欢迎回来
                </Typography.Title>
                <Typography.Paragraph className="dashboard-subtitle">
                  账号已经从门店中解耦。接下来可以在这里选择客户或工作人员视角，并根据门店成员关系加载对应的工作内容。
                </Typography.Paragraph>
              </div>
              <div className="dashboard-account-box">
                <div className="dashboard-account-title">登录账号</div>
                <div className="dashboard-account-email">{user.username}</div>
              </div>
            </div>
          </div>

          <div className="dashboard-next">
            <div className="dashboard-next-label">下一步</div>
            <Typography.Title level={3} className="!mb-3 !mt-2 !text-white">
              门店上下文
            </Typography.Title>
            <p className="dashboard-next-text">
              员工邀请、门店切换、客户会员档案都可以围绕同一个账号展开，不需要重复注册。
            </p>
          </div>
        </section>

        <section className="dashboard-card-grid">
          {sections.map((section) => (
            <Card key={section.title} className="border border-slate-200 shadow-sm" styles={{ body: { padding: 20 } }}>
              <div className="dashboard-card-body">
                <div>
                  <div className="dashboard-card-head">
                    <Typography.Title level={4} className="!mb-0 !text-lg">
                      {section.title}
                    </Typography.Title>
                    <Tag color={section.tone}>{section.status}</Tag>
                  </div>
                  <Typography.Paragraph className="dashboard-card-text">
                    {section.desc}
                  </Typography.Paragraph>
                </div>
                <Button block disabled>
                  即将开放
                </Button>
              </div>
            </Card>
          ))}
        </section>
      </Layout.Content>
    </Layout>
  );
}
