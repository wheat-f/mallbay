"use client";

import { Button, Image, Skeleton, Tag, Typography } from "antd";
import {
  ArrowLeftOutlined,
  EnvironmentOutlined,
  PictureOutlined,
  SafetyCertificateOutlined,
  ShopOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { storeApi } from "../../../src/lib/api";

const STORE_STATUS_LABEL: Record<string, string> = {
  DRAFTED: "筹办中",
  PENDING_REVIEW: "审核中",
  PUBLISHED: "公开状态",
  FROZEN: "暂停访问"
};

export default function StoreDetailPage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const router = useRouter();

  const storeQuery = useQuery({
    queryKey: ["store-detail", storeId],
    queryFn: () => storeApi.getStore(storeId),
    retry: false,
    staleTime: 30_000
  });

  const store = storeQuery.data;
  const coverPhoto = store?.photos.find((photo) => photo.isCover) ?? store?.photos[0] ?? null;
  const galleryPhotos = store?.photos ?? [];

  return (
    <main className="store-public-shell">
      <header className="store-public-topbar">
        <button className="store-public-brand" type="button" onClick={() => router.push("/")}>
          <span>mallbay</span>
          <small>门店运营系统</small>
        </button>
        <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/")}>
          返回门店大厅
        </Button>
      </header>

      {storeQuery.isLoading && (
        <section className="store-public-skeleton">
          <Skeleton.Image active className="store-public-skeleton-cover" />
          <Skeleton active paragraph={{ rows: 4 }} />
        </section>
      )}

      {storeQuery.isError && (
        <section className="store-public-empty">
          <ShopOutlined />
          <Typography.Title level={3}>门店不存在或尚未公开</Typography.Title>
          <Typography.Text>请返回门店大厅重新选择公开门店。</Typography.Text>
          <Button type="primary" onClick={() => router.push("/")}>
            返回门店大厅
          </Button>
        </section>
      )}

      {store && (
        <>
          <section className="store-public-hero">
            <div className="store-public-copy">
              <div className="store-public-kicker">
                <Tag>{STORE_STATUS_LABEL[store.status] ?? store.status}</Tag>
                <span>认证服务门店</span>
              </div>
              <Typography.Title className="store-public-title">{store.name}</Typography.Title>
              <Typography.Paragraph className="store-public-subtitle">
                {store.description ?? "该门店暂未填写简介。您可以查看门店位置、照片，并返回大厅浏览更多公开门店。"}
              </Typography.Paragraph>
              <div className="store-public-meta">
                <span>认证技师: 已认证团队</span>
                <span>工位: 以门店详情为准</span>
              </div>
              <div className="store-public-actions">
                <Button type="primary" icon={<ShopOutlined />} onClick={() => router.push("/")}>
                  浏览更多门店
                </Button>
                <Button icon={<PictureOutlined />} disabled={galleryPhotos.length === 0}>
                  {galleryPhotos.length > 0 ? `${galleryPhotos.length} 张门店照片` : "暂无门店照片"}
                </Button>
              </div>
            </div>

            <div className="store-public-cover">
              {coverPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverPhoto.url} alt={store.name} />
              ) : (
                <div className="store-public-cover-placeholder">
                  <ShopOutlined />
                  <span>暂无封面</span>
                </div>
              )}
            </div>
          </section>

          <section className="store-public-grid">
            <article className="store-public-info-card">
              <div className="store-public-card-icon">
                <EnvironmentOutlined />
              </div>
              <div>
                <h2>门店位置</h2>
                <p>{store.address ?? "该门店暂未填写详细地址。"}</p>
              </div>
            </article>

            <article className="store-public-info-card">
              <div className="store-public-card-icon">
                <SafetyCertificateOutlined />
              </div>
              <div>
                <h2>服务状态</h2>
                <p>{STORE_STATUS_LABEL[store.status] ?? store.status} · 创建于 {new Date(store.createdAt).toLocaleDateString("zh-CN")}</p>
              </div>
            </article>
          </section>

          {galleryPhotos.length > 0 && (
            <section className="store-public-gallery">
              <div className="store-public-section-head">
                <div>
                  <span>门店影像</span>
                  <h2>门店照片</h2>
                </div>
                <Typography.Text>{galleryPhotos.length} 张</Typography.Text>
              </div>
              <Image.PreviewGroup>
                <div className="store-public-photo-grid">
                  {galleryPhotos.map((photo) => (
                    <div key={photo.id} className="store-public-photo">
                      <Image src={photo.url} alt={store.name} preview={{ mask: false }} />
                      {photo.isCover && <span>封面</span>}
                    </div>
                  ))}
                </div>
              </Image.PreviewGroup>
            </section>
          )}
        </>
      )}
    </main>
  );
}
