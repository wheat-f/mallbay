"use client";

import { App, Badge, Button, Popover, Spin, Tabs, Typography } from "antd";
import {
  BellOutlined,
  CheckOutlined,
  CloseOutlined,
  ShopOutlined
} from "@ant-design/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { memberApi } from "../features/members/api";
import { notificationApi } from "../features/notifications/api";
import { useAuthStore } from "../stores/auth-store";

const NOTIF_LABEL: Record<string, string> = {
  STORE_INVITATION: "门店邀请",
  INVITATION_ACCEPTED: "邀请已接受",
  INVITATION_REJECTED: "邀请已拒绝",
  AUDIT_APPROVED: "审核通过",
  AUDIT_REJECTED: "审核驳回",
  STORE_FROZEN: "门店已冻结",
  STORE_UNFROZEN: "门店已解冻",
  REMOVED_FROM_STORE: "已被移出门店"
};

const POSITION_LABEL: Record<string, string> = {
  SALES: "销售", PURCHASING: "采购", FINANCE: "财务",
  SCHEDULER: "排班员", CONSTRUCTION: "施工员", APPRENTICE: "学徒"
};

function notifSummary(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "STORE_INVITATION":
      return `「${payload.storeName}」邀请你加入，岗位：${POSITION_LABEL[payload.position as string] ?? payload.position}`;
    case "INVITATION_ACCEPTED":
      return `你发出的邀请已被接受（${payload.storeName}）`;
    case "INVITATION_REJECTED":
      return `你发出的邀请已被拒绝（${payload.storeName}）`;
    case "AUDIT_APPROVED":
      return `「${payload.storeName}」审核已通过，门店现已公开`;
    case "AUDIT_REJECTED":
      return `「${payload.storeName}」审核被驳回：${payload.reviewNote ?? ""}`;
    case "STORE_FROZEN":
      return `「${payload.storeName}」已被冻结`;
    case "STORE_UNFROZEN":
      return `「${payload.storeName}」已解除冻结`;
    case "REMOVED_FROM_STORE":
      return `你已被移出「${payload.storeName}」`;
    default:
      return type;
  }
}

// ─── 邀请卡片 ─────────────────────────────────────────────────────
function InvitationCard({ inv, onDone }: {
  inv: {
    id: string; position: string; createdAt: string;
    store: { id: string; name: string };
    invitedBy: { id: string; username: string; nickname: string | null };
  };
  onDone: () => void;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();

  const acceptMutation = useMutation({
    mutationFn: () => memberApi.accept(inv.id),
    onSuccess: () => {
      message.success(`已加入「${inv.store.name}」`);
      // 刷新 me，让首页门店入口立即出现
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
      onDone();
    },
    onError: (e: Error) => message.error(e.message)
  });

  const rejectMutation = useMutation({
    mutationFn: () => memberApi.reject(inv.id),
    onSuccess: () => {
      message.success("已拒绝邀请");
      queryClient.invalidateQueries({ queryKey: ["invitations"] });
    },
    onError: (e: Error) => message.error(e.message)
  });

  const inviterName = inv.invitedBy.nickname ?? inv.invitedBy.username;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--mb-primary-fixed-dim)] bg-[var(--mb-primary-container)] p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--mb-primary-fixed)]">
        <ShopOutlined style={{ color: "var(--mb-primary)", fontSize: 14 }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--mb-text-primary)]">{inv.store.name}</div>
        <div className="mt-0.5 text-xs text-[var(--mb-text-muted)]">
          {inviterName} 邀请你以「{POSITION_LABEL[inv.position] ?? inv.position}」加入
        </div>
        <div className="mt-2 flex gap-2">
          <Button
            size="small" type="primary" icon={<CheckOutlined />}
            loading={acceptMutation.isPending}
            onClick={() => acceptMutation.mutate()}
          >
            接受
          </Button>
          <Button
            size="small" danger icon={<CloseOutlined />}
            loading={rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
          >
            拒绝
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── 通知铃铛 ─────────────────────────────────────────────────────
export function NotificationBell({ onJoined }: { onJoined?: () => void }) {
  const user = useAuthStore((state) => state.user);
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  // 未读数：定时轮询
  const unreadQuery = useQuery({
    queryKey: ["notif-unread"],
    queryFn: notificationApi.unreadCount,
    enabled: !!user,
    refetchInterval: 30_000,
    staleTime: 0
  });

  // 邀请列表（打开时才请求）
  const invitationsQuery = useQuery({
    queryKey: ["invitations"],
    queryFn: memberApi.myInvitations,
    enabled: !!user && open,
    staleTime: 0
  });

  // 通知列表（打开时才请求）
  const notifQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationApi.list(1, 20),
    enabled: !!user && open,
    staleTime: 0
  });

  const markAllMutation = useMutation({
    mutationFn: notificationApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notif-unread"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }
  });

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && (unreadQuery.data?.count ?? 0) > 0) {
      markAllMutation.mutate();
    }
  };

  const invitations = invitationsQuery.data ?? [];
  const notifications = notifQuery.data?.items ?? [];
  const unread = unreadQuery.data?.count ?? 0;

  const panelContent = (
    <div style={{ width: 340 }}>
      <Tabs
        size="small"
        items={[
          {
            key: "invitations",
            label: (
              <span>
                邀请
                {invitations.length > 0 && (
                  <span style={{
                    marginLeft: 5, display: "inline-flex", alignItems: "center", justifyContent: "center",
                    minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999,
                    background: "var(--mb-primary)", color: "#fff", fontSize: 10, fontWeight: 600, lineHeight: 1
                  }}>
                    {invitations.length}
                  </span>
                )}
              </span>
            ),
            children: (
              <div style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 4px" }}>
                {invitationsQuery.isLoading && (
                  <div className="flex justify-center py-6"><Spin size="small" /></div>
                )}
                {!invitationsQuery.isLoading && invitations.length === 0 && (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "var(--mb-text-muted)", fontSize: 13 }}>
                    暂无待处理邀请
                  </div>
                )}
                {invitations.map((inv) => (
                  <InvitationCard
                    key={inv.id}
                    inv={inv}
                    onDone={() => {
                      setOpen(false);
                      onJoined?.();
                    }}
                  />
                ))}
              </div>
            )
          },
          {
            key: "notifications",
            label: "通知",
            children: (
              <div style={{ maxHeight: 380, overflowY: "auto", margin: "0 -12px" }}>
                {notifQuery.isLoading && (
                  <div className="flex justify-center py-6"><Spin size="small" /></div>
                )}
                {!notifQuery.isLoading && notifications.length === 0 && (
                  <div style={{ padding: "32px 0", textAlign: "center", color: "var(--mb-text-muted)", fontSize: 13 }}>
                    暂无通知
                  </div>
                )}
                {notifications.map((n) => (
                  <div
                    key={n.id}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "10px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      background: !n.isRead ? "#f0f7ff" : "transparent"
                    }}
                  >
                    {!n.isRead && (
                      <span style={{
                        marginTop: 5, width: 6, height: 6, borderRadius: "50%",
                        background: "var(--mb-primary)", flexShrink: 0
                      }} />
                    )}
                    <div style={{ marginLeft: !n.isRead ? 0 : 14 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>
                        {NOTIF_LABEL[n.type] ?? n.type}
                      </div>
                      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2, lineHeight: 1.5 }}>
                        {notifSummary(n.type, n.payload)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--mb-text-muted)", marginTop: 4 }}>
                        {new Date(n.createdAt).toLocaleString("zh-CN", {
                          month: "numeric", day: "numeric",
                          hour: "2-digit", minute: "2-digit"
                        })}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          }
        ]}
      />
    </div>
  );

  if (!user) return null;

  return (
    <Popover
      content={panelContent}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={handleOpenChange}
      arrow={false}
      styles={{ content: { padding: "8px 12px" } }}
    >
      <button className="notif-bell-btn" aria-label="通知">
        <Badge count={unread} size="small" offset={[-2, 2]}>
          <BellOutlined style={{ fontSize: 18, color: "#475569" }} />
        </Badge>
      </button>
    </Popover>
  );
}
