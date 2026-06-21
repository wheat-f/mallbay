"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Progress, Switch, Tag } from "antd";
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
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";
import { useAuthStore } from "../../../src/stores/auth-store";

const queueStorageKey = "mallbay-construction-offline-queue";
const lastSyncStorageKey = "mallbay-construction-last-sync-at";
const maxCacheSizeMb = 200;

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
    <div className="management-page worker-profile-page">
      <StorePageHeader title="连接与离线设置" description="管理施工端网络、云端同步和本地缓存策略。">
        <Button icon={<SyncOutlined />} onClick={() => router.push("/construction/offline")}>
          查看离线队列
        </Button>
        <Button type="primary" icon={<CloudSyncOutlined />} onClick={() => router.push("/construction/tasks")}>
          返回我的任务
        </Button>
      </StorePageHeader>

      <section className="construction-profile-status-card worker-profile-status-card">
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
          <div>
            <dt>终端</dt>
            <dd>Web 后台</dd>
          </div>
        </dl>
      </section>

      <section className="worker-profile-grid">
        <Card className="construction-profile-config-section" title="基础配置">
          <div className="construction-profile-config-list">
            <button
              type="button"
              className="construction-profile-setting-row"
              onClick={() => storeMember && router.push(`/workbench/${storeMember.store.id}`)}
              disabled={!storeMember}
            >
              <ShopOutlined />
              <span>
                <strong>门店名称</strong>
                <em>{storeMember?.store.name ?? "未加入门店"}</em>
              </span>
              <b>{storeMember ? "进入工作台" : "待邀请"}</b>
            </button>
            <button type="button" className="construction-profile-setting-row" onClick={() => router.push("/construction/offline")}>
              <ApiOutlined />
              <span>
                <strong>云端服务</strong>
                <em>已加密连接，点击查看离线同步队列</em>
              </span>
              <SafetyCertificateOutlined />
            </button>
          </div>
        </Card>

        <Card className="construction-profile-cache-card" title="离线缓存空间">
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
        </Card>

        <Card className="construction-profile-toggle-list" title="同步策略">
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
        </Card>

        <Card className="worker-profile-version-card">
          <Tag color="processing">mallbay 施工端</Tag>
          <h2>施工人员 Web 工作区</h2>
          <p>Web 后台用于查看任务、排班、物料与离线队列；小程序作为外出施工和现场拍照的移动入口。</p>
        </Card>
      </section>
    </div>
  );
}
