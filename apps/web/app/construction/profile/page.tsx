"use client";

import { useEffect, useMemo, useState } from "react";
import { Avatar, Button, Progress, Switch, Tag, Typography } from "antd";
import {
  ApiOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  HomeOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  ShopOutlined,
  SyncOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";
import { useAuthStore } from "../../../src/stores/auth-store";

const POSITION_LABEL: Record<string, string> = {
  MANAGER: "店长",
  SALES: "销售",
  CUSTOMER_SERVICE: "客服",
  PURCHASING: "采购",
  FINANCE: "财务",
  SCHEDULER: "施工主管",
  CONSTRUCTION: "施工员",
  APPRENTICE: "学徒"
};

const queueStorageKey = "mallbay-construction-offline-queue";
const lastSyncStorageKey = "mallbay-construction-last-sync-at";
const maxCacheSizeMb = 200;
const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ConstructionProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeMember = user?.storeMember;
  const displayName = user?.nickname ?? user?.username ?? "施工人员";
  const [cacheUsedMb, setCacheUsedMb] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState("暂无记录");
  const [wifiOnly, setWifiOnly] = useState(true);
  const [autoLog, setAutoLog] = useState(false);
  const cachePercent = useMemo(
    () => Math.min(Math.round((cacheUsedMb / maxCacheSizeMb) * 100), 100),
    [cacheUsedMb]
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const queue = window.localStorage.getItem(queueStorageKey) ?? "[]";
      setCacheUsedMb(queue.length / 1024 / 1024);
      setLastSyncAt(window.localStorage.getItem(lastSyncStorageKey) ?? "暂无记录");
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <ConstructionMobileShell title="我的" subtitle="账号、门店与施工端入口" active="profile">
      <section className="construction-profile-hero">
        <div className="construction-profile-card">
          <Avatar size={64} src={user?.avatarUrl} className="construction-profile-avatar">
            {displayName.charAt(0).toUpperCase()}
          </Avatar>
          <div className="construction-profile-info">
            <Typography.Title level={3} className="!mb-1">
              {displayName}
            </Typography.Title>
            <Typography.Text type="secondary">@{user?.username ?? "未登录"}</Typography.Text>
            <div className="detail-status-strip mt-3">
              <Tag>{storeMember ? POSITION_LABEL[storeMember.position] ?? storeMember.position : "未加入门店"}</Tag>
              {storeMember ? <Tag color="processing">{storeMember.store.name}</Tag> : null}
            </div>
          </div>
        </div>
        <Button shape="circle" icon={<SettingOutlined />} onClick={() => router.push("/profile")} />
      </section>

      <section className="construction-profile-status-card">
        <div>
          <span>当前网络状态</span>
          <strong>
            <i /> 已连接
          </strong>
        </div>
        <div className="construction-profile-status-icon">
          <CloudSyncOutlined />
        </div>
        <dl>
          <div>
            <dt>延迟 Ping</dt>
            <dd>本地开发</dd>
          </div>
          <div>
            <dt>最后同步</dt>
            <dd>{lastSyncAt}</dd>
          </div>
        </dl>
      </section>

      <section className="construction-mobile-panel construction-profile-config-list">
        <h2>基础配置</h2>
        <button type="button" onClick={() => storeMember && router.push(`/workbench/${storeMember.store.id}`)} disabled={!storeMember}>
          <ShopOutlined />
          <span>
            <strong>门店 ID</strong>
            <em>{storeMember?.store.id ?? "未加入门店"}</em>
          </span>
          <b>{storeMember ? "进入" : "待邀请"}</b>
        </button>
        <button type="button" onClick={() => router.push("/construction/offline")}>
          <ApiOutlined />
          <span>
            <strong>API 终端地址</strong>
            <em>{apiEndpoint}</em>
          </span>
          <SafetyCertificateOutlined />
        </button>
      </section>

      <section className="construction-profile-cache-card">
        <div className="construction-mobile-section-head">
          <div>
            <h2>离线缓存管理</h2>
            <p>缓存施工照片、任务状态和请假申请，联网后统一同步。</p>
          </div>
          <strong>{cacheUsedMb.toFixed(1)} MB</strong>
        </div>
        <Progress percent={cachePercent} showInfo={false} />
        <div className="construction-profile-cache-actions">
          <Button type="primary" icon={<SyncOutlined />} onClick={() => router.push("/construction/offline")}>
            立即同步
          </Button>
          <Button danger icon={<DeleteOutlined />} onClick={() => router.push("/construction/offline")}>
            清理缓存
          </Button>
        </div>
      </section>

      <section className="construction-profile-toggle-list">
        <label>
          <DatabaseOutlined />
          <span>仅在 Wi-Fi 下下载数据</span>
          <Switch checked={wifiOnly} onChange={setWifiOnly} />
        </label>
        <label>
          <CloudSyncOutlined />
          <span>自动保存操作日志</span>
          <Switch checked={autoLog} onChange={setAutoLog} />
        </label>
      </section>

      <section className="construction-mobile-panel">
        <h2>快捷入口</h2>
        <div className="operation-queue-list">
          <button className="operation-queue-item detail-list-item" type="button" onClick={() => router.push("/profile")}>
            <span>
              <Typography.Text strong>
                <SettingOutlined /> 账号设置
              </Typography.Text>
              <div className="management-kpi-desc">修改头像、昵称、密码和绑定信息</div>
            </span>
          </button>
          <button
            className="operation-queue-item detail-list-item"
            type="button"
            disabled={!storeMember}
            onClick={() => storeMember && router.push(`/workbench/${storeMember.store.id}`)}
          >
            <span>
              <Typography.Text strong>
                <HomeOutlined /> 门店工作台
              </Typography.Text>
              <div className="management-kpi-desc">返回桌面管理后台处理完整业务</div>
            </span>
          </button>
        </div>
      </section>

      <footer className="construction-profile-version">
        <span>MallBay 施工端 v4.2.1-dev</span>
        <span>门店施工协同解决方案</span>
      </footer>
    </ConstructionMobileShell>
  );
}
