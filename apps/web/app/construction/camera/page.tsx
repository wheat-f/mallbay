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
  inspection:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuChQCgKHt0_ndgbNHmpW3N5R6jGtM_8nDa8KbL09KQqhcCR75_ed36nnpuodlce9ux7ayR15RGC6owpa_8wllYu2UX8iRYD57oO0ptaOZuvMqkY_-Vl0G9u1q5F3UTJ4JcHBmSSe7upxHRMZaeqq8ZLdZuALd_XS4AlvTlFv_u0mOYCU3dwEf5oVyjFqJ1AjR5NHOAj_o8Jt8bGCsjMzkzXA4_jFZcbql3EORs1zwjPLI0dKhWvcVmD2Yd-k_u8WAmkNkzFQUtdmslG",
  filmBox:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuC-p1tkbMwIs0_U9F-XLxbeZiAgnQSCeDzIBYCPcKHVwkVpvPA72YbivS963f6yRhIREpYPSdZC5_78zg0vzYL3x2B15ZMdI7fQGiYV4Dcgbq1lFdlyACOQMeSVlFvlQtOT1IMUeQFjsQa05cd-yUx2JHsAS7R339ENZWccr6nzaZd6djVcqkilmxMLBYLMz8KfoIrIG-7QiYmRkK7C6OIqZ5wJyKodnZ_c-z9SZS93ngdyKfvqUhPs4G33ll9UoWstmKVYgg_z4N4i",
  processA:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuBoW3-RIzdmprFSSIuxbHoOF0t358peAV5uOLsxs-n2YHsY2o3pGFkM06TwCIb7X9wG4sxRk4VaplpxvlSEkHSUtRGo-YDqqJv1mKAFfhmPnFSHpy1yg--4tFQKooKqlziqwBAvPbASZpqsqavNrQRkdYDjR7ycaI_ph33vJaGL1vKxg_NcdwDx3S52rfY9fFWZNVNYHqYEBaw2loTKQ5O5bW71wOyVRXodHpCZ73nUUmZ5ND6c0wxqyqA1H9eR_VSibPitqdFY1z9G",
  processB:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuB4UNvKI0FfgQ1YtrEAQ6IvWiL7BHUhdZjSqwgRUSTv4Q_2oQgBmvCcPo2Npdl-v3BSxEQp5ymY9rkur9mKqATdxVdU2PsvYc7QiJj1cRvYPxL4Ww_G20bLpVjvhO2N-4v0gxpNRePNe_gSS-jjwui17vGTs0hV-r3CvGiDACyLubaAetY30g8VgHlWEQFOvSXu9TjpJgXOU4s3umtz4L7KIHrnn95eUEm3Z4Q3JtfeUM2e-XX9h1n1vs2bSUcSVuvNKW8Dp297D1jt",
  completed:
    "https://lh3.googleusercontent.com/aida-public/AB6AXuDHYyMAGN8f1U6ZBI6LbtcFpd16viwHJ_jO_Oe0jLmn6x0mBy5X3ufvpRftnNGiI57jZReREb6jonXhR9EIFGDQ2vrSB5XfrIAo0811KhMByjoN4c-8IRJ7mRLvnn9LTT_mIOU9I_JO6Ty04O1OWKMYoO6bExGozVxTgieYcoRWslOVLwAs3mNx46eS8mRsH5fuV0sM8pxySyKyCObQxlT4s5Sed9r5IPwktTCyUtbZ-KxTiHG1rL6rCCNaKBQzsH6HqEPAdFYeUE1h"
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
