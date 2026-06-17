"use client";

import Image from "next/image";
import { Button, Progress } from "antd";
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
import { ConstructionMobileShell } from "../../../src/features/construction/mobile-shell";

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
    placeholderText: "点击拍照或上传图片",
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
    placeholderText: "车主与门店招牌合影",
    placeholderIcon: "store"
  }
];

const processPhotos = [photoAssets.processA, photoAssets.processB];

export default function ConstructionCameraPage() {
  const router = useRouter();

  return (
    <ConstructionMobileShell
      title="施工照片上传"
      subtitle="按阶段留存验车、施工过程和完工凭证"
      active="camera"
      variant="calendar"
      badgeCount={2}
      desktopHref="/construction/assignments"
    >
      <div className="construction-camera-workspace">
        <div className="construction-camera-offline-banner">
          <CloudSyncOutlined />
          <span>当前处于离线状态，照片已保存至本地队列，连接网络后自动同步。</span>
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
                <span>可选上传多张照片记录进度</span>
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

      <footer className="construction-camera-bottom-actions">
        <Button icon={<SaveOutlined />} onClick={() => router.push("/construction/offline")}>
          保存并同步
        </Button>
        <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => router.push("/construction/tasks")}>
          提交完工
        </Button>
      </footer>
    </ConstructionMobileShell>
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
          sizes="(max-width: 430px) calc(100vw - 52px), 378px"
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
