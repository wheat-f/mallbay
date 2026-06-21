"use client";

import Image from "next/image";
import { Button, Card, Progress, Tag } from "antd";
import {
  CameraOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  CloudSyncOutlined,
  FileImageOutlined,
  LoadingOutlined,
  PlusOutlined,
  SaveOutlined,
  ShopOutlined,
  SyncOutlined,
  WarningOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";
import { StorePageHeader } from "../../../src/features/workbench/store-page-header";

type PhotoStatus = "uploaded" | "local" | "uploading" | "empty" | "failed";

type PhotoItem = {
  title: string;
  status: PhotoStatus;
  statusText: string;
  imageSrc?: string;
  placeholderText?: string;
  placeholderIcon?: "camera" | "store";
  progress?: number;
};

const photoAssets = {
  inspection: "/prototype-assets/construction-camera-inspection.png",
  filmBox: "/prototype-assets/construction-camera-film-box.png",
  processA: "/prototype-assets/construction-camera-process-a.png",
  processB: "/prototype-assets/construction-camera-process-b.png",
  completed: "/prototype-assets/construction-camera-completed.png"
};

const beforePhotos: PhotoItem[] = [
  {
    title: "验车照片",
    status: "uploaded",
    statusText: "已上传",
    imageSrc: photoAssets.inspection
  },
  {
    title: "膜箱照片",
    status: "local",
    statusText: "本地暂存",
    imageSrc: photoAssets.filmBox
  },
  {
    title: "膜桶照片",
    status: "uploading",
    statusText: "上传中...",
    progress: 65
  },
  {
    title: "车架号照片",
    status: "empty",
    statusText: "未上传",
    placeholderText: "补传车架号照片",
    placeholderIcon: "camera"
  }
];

const afterPhotos: PhotoItem[] = [
  {
    title: "施工后照片",
    status: "failed",
    statusText: "上传失败",
    imageSrc: photoAssets.completed
  },
  {
    title: "门头合影照片",
    status: "empty",
    statusText: "未上传",
    placeholderText: "补传车主与门店招牌合影",
    placeholderIcon: "store"
  }
];

const processPhotos = [photoAssets.processA, photoAssets.processB];

const cameraMetrics = [
  { label: "必传照片", value: "6", tone: "primary" },
  { label: "已完成", value: "3", tone: "success" },
  { label: "待同步", value: "2", tone: "warning" },
  { label: "异常", value: "1", tone: "danger" }
];

export default function ConstructionCameraPage() {
  const router = useRouter();

  return (
    <div className="management-page worker-camera-page">
      <StorePageHeader title="施工照片上传" description="在 Web 后台补传、核验和同步施工照片，现场拍照入口由小程序承接。">
        <Button icon={<CloudSyncOutlined />} onClick={() => router.push("/construction/offline")}>
          查看离线队列
        </Button>
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => router.push("/construction/tasks")}>
          返回我的任务
        </Button>
      </StorePageHeader>

      <section className="worker-camera-hero">
        <div>
          <Tag color="processing">当前工单</Tag>
          <h2>ORD20260616850186</h2>
          <p>宝马 5 系隔热膜施工，核验验车照片、膜箱膜桶照片、施工过程和完工凭证后再提交完工。</p>
        </div>
        <div className="worker-camera-hero-progress">
          <strong>50%</strong>
          <Progress percent={50} showInfo={false} />
          <span>3 / 6 必传照片已完成</span>
        </div>
      </section>

      <section className="worker-camera-summary" aria-label="照片上传状态">
        {cameraMetrics.map((item) => (
          <article key={item.label} className={`worker-camera-stat is-${item.tone}`}>
            <strong>{item.value}</strong>
            <span>{item.label}</span>
          </article>
        ))}
      </section>

      <div className="worker-camera-grid">
        <div className="construction-camera-workspace">
          <div className="construction-camera-offline-banner">
            <CloudSyncOutlined />
            <span>检测到 2 张照片仍在本地队列，连接稳定后可从离线队列继续同步。</span>
          </div>

          <PhotoSection title="施工前" required progressText="2/4 已完成" items={beforePhotos} />

          <section className="construction-camera-upload-section">
            <div className="construction-camera-section-head">
              <h2>施工中</h2>
            </div>
            <article className="construction-camera-photo-card construction-camera-process-card">
              <div className="construction-camera-photo-head">
                <div>
                  <strong>施工过程照片</strong>
                  <span>可上传多张照片记录进度</span>
                </div>
              </div>
              <div className="construction-camera-gallery" aria-label="施工过程照片">
                <button className="construction-camera-gallery-add" type="button">
                  <PlusOutlined />
                  <span>添加</span>
                </button>
                {processPhotos.map((src) => (
                  <div key={src} className="construction-camera-gallery-image">
                    <Image
                      className="construction-camera-gallery-thumb"
                      src={src}
                      alt="施工过程照片"
                      width={112}
                      height={112}
                      sizes="112px"
                      unoptimized
                    />
                    <button type="button" aria-label="移除施工过程照片">
                      <CloseCircleOutlined />
                    </button>
                  </div>
                ))}
              </div>
              <PhotoActions />
            </article>
          </section>

          <PhotoSection title="施工后" required items={afterPhotos} />
        </div>

        <aside className="worker-camera-side">
          <Card className="worker-camera-check-card" title="提交前检查">
            <ol>
              <li>施工前必传照片完整</li>
              <li>膜箱、膜桶批次与物料核验一致</li>
              <li>施工后照片和门头合影完成</li>
              <li>上传失败照片已重试或标记异常</li>
            </ol>
          </Card>

          <Card className="worker-camera-sync-card" title="同步状态">
            <dl>
              <div>
                <dt>云端状态</dt>
                <dd>等待 2 张照片同步</dd>
              </div>
              <div>
                <dt>最近同步</dt>
                <dd>今天 10:48</dd>
              </div>
              <div>
                <dt>异常处理</dt>
                <dd>施工后照片需重试</dd>
              </div>
            </dl>
          </Card>

          <footer className="construction-camera-bottom-actions">
            <Button icon={<SaveOutlined />} onClick={() => router.push("/construction/offline")}>
              保存并同步
            </Button>
            <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => router.push("/construction/tasks")}>
              提交完工
            </Button>
          </footer>
        </aside>
      </div>
    </div>
  );
}

function PhotoSection({
  title,
  required,
  progressText,
  items
}: {
  title: string;
  required?: boolean;
  progressText?: string;
  items: PhotoItem[];
}) {
  return (
    <section className="construction-camera-upload-section">
      <div className="construction-camera-section-head">
        <h2>
          {title}
          {required ? <span>（必传）</span> : null}
        </h2>
        {progressText ? <em>{progressText}</em> : null}
      </div>
      <div className="construction-camera-photo-list">
        {items.map((item) => (
          <PhotoCard key={item.title} item={item} />
        ))}
      </div>
    </section>
  );
}

function PhotoCard({ item }: { item: PhotoItem }) {
  return (
    <article className={`construction-camera-photo-card is-${item.status}`}>
      <div className="construction-camera-photo-head">
        <div>
          <strong>{item.title}</strong>
          <span className={getStatusClassName(item.status)}>
            {getStatusIcon(item.status)}
            {item.statusText}
          </span>
        </div>
      </div>

      <PhotoPreview item={item} />
      <PhotoActions disabled={item.status === "uploading"} />
    </article>
  );
}

function PhotoPreview({ item }: { item: PhotoItem }) {
  if (item.progress !== undefined) {
    return (
      <div className="construction-camera-preview construction-camera-progress-preview">
        <Progress percent={item.progress} showInfo={false} />
        <span>{item.progress}%</span>
      </div>
    );
  }

  if (item.imageSrc) {
    return (
      <div className="construction-camera-preview">
        <Image
          className="construction-camera-image"
          src={item.imageSrc}
          alt={`${item.title}预览`}
          width={640}
          height={360}
          sizes="(max-width: 900px) calc(100vw - 64px), 360px"
          unoptimized
        />
        {item.status === "local" ? (
          <div className="construction-camera-preview-overlay">
            <SyncOutlined spin />
            <span>待同步</span>
          </div>
        ) : null}
        {item.status === "failed" ? (
          <div className="construction-camera-preview-overlay is-danger">
            <SyncOutlined />
            <span>点击重试</span>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <button className="construction-camera-preview construction-camera-upload-placeholder" type="button">
      {item.placeholderIcon === "store" ? <ShopOutlined /> : <CameraOutlined />}
      <span>{item.placeholderText ?? "点击拍照或上传图片"}</span>
    </button>
  );
}

function PhotoActions({ disabled = false }: { disabled?: boolean }) {
  return (
    <div className={disabled ? "construction-camera-card-actions is-disabled" : "construction-camera-card-actions"}>
      <button type="button" disabled={disabled}>
        <CameraOutlined />
        拍照
      </button>
      <button type="button" disabled={disabled}>
        <FileImageOutlined />
        相册
      </button>
    </div>
  );
}

function getStatusClassName(status: PhotoStatus) {
  return `construction-camera-status is-${status}`;
}

function getStatusIcon(status: PhotoStatus) {
  if (status === "uploaded") return <CheckCircleOutlined />;
  if (status === "local") return <SaveOutlined />;
  if (status === "uploading") return <LoadingOutlined spin />;
  if (status === "failed") return <WarningOutlined />;
  return <FileImageOutlined />;
}
