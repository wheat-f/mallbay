"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Progress, Switch } from "antd";
import {
  ApiOutlined,
  CloudSyncOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
  SyncOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";
import { useAuthStore } from "../../../src/stores/auth-store";

const queueStorageKey = "mallbay-construction-offline-queue";
const lastSyncStorageKey = "mallbay-construction-last-sync-at";
const maxCacheSizeMb = 200;
const apiEndpoint = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ConstructionProfilePage() {
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const storeMember = user?.storeMember;
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
    <ConstructionMobileShell title="连接与离线设置" subtitle="管理施工端网络、终端和本地缓存" active="profile" variant="settings">
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
            <dt>延迟 (Ping)</dt>
            <dd>24 ms</dd>
          </div>
          <div>
            <dt>最后同步</dt>
            <dd>{lastSyncAt}</dd>
          </div>
        </dl>
      </section>

      <section className="construction-profile-config-section">
        <h2>基础配置</h2>
        <div className="construction-profile-config-list">
          <button
            type="button"
            className="construction-profile-setting-row"
            onClick={() => storeMember && router.push(`/workbench/${storeMember.store.id}`)}
            disabled={!storeMember}
          >
            <ShopOutlined />
            <span>
              <strong>门店 ID</strong>
              <em>{storeMember?.store.id ?? "未加入门店"}</em>
            </span>
            <b>{storeMember ? "修改" : "待邀请"}</b>
          </button>
          <button type="button" className="construction-profile-setting-row" onClick={() => router.push("/construction/offline")}>
            <ApiOutlined />
            <span>
              <strong>API 终端地址</strong>
              <em>{apiEndpoint}</em>
            </span>
            <SafetyCertificateOutlined />
          </button>
        </div>
      </section>

      <section className="construction-profile-cache-card">
        <div className="construction-mobile-section-head">
          <div>
            <h2>离线缓存空间</h2>
            <p>建议限制：{maxCacheSizeMb}MB</p>
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

      <footer className="construction-profile-version">
        <span>MallBay 施工端 v4.2.1-dev</span>
        <span>门店施工协同解决方案</span>
      </footer>
    </ConstructionMobileShell>
  );
}
