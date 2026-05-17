"use client";

import {
  App, Button, Divider, Image, Layout, Skeleton, Tag, Typography
} from "antd";
import {
  ArrowLeftOutlined, EnvironmentOutlined, ShopOutlined
} from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { storeApi } from "../../../src/lib/api";

// ─── 主页面 ───────────────────────────────────────────────────────
export default function StoreDetailPage() {
  const params = useParams<{ id: string }>();
  const storeId = params.id;
  const router = useRouter();
  const { message } = App.useApp();

  const storeQuery = useQuery({
    queryKey: ["store-detail", storeId],
    queryFn: () => storeApi.getStore(storeId),
    retry: false,
    staleTime: 30_000
  });

  const store = storeQuery.data;

  // 封面图（isCover 优先，否则第一张）
  const coverPhoto =
    store?.photos.find((p) => p.isCover) ?? store?.photos[0] ?? null;

  return (
    <Layout style={{ minHeight: "100vh", background: "var(--background)" }}>
      {/* Header */}
      <header className="dashboard-header">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.back()}
        />
        <Typography.Title level={5} className="!mb-0 !text-slate-950"
          style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          {store?.name ?? "门店详情"}
        </Typography.Title>
        <div style={{ width: 32 }} />
      </header>

      <Layout.Content style={{ maxWidth: 760, margin: "0 auto", width: "100%", padding: "28px 20px 64px" }}>
        {/* ── 加载骨架 ── */}
        {storeQuery.isLoading && (
          <div className="section-card" style={{ overflow: "hidden" }}>
            <Skeleton.Image active style={{ width: "100%", height: 260 }} />
            <div style={{ padding: "20px 24px" }}>
              <Skeleton active paragraph={{ rows: 3 }} />
            </div>
          </div>
        )}

        {/* ── 404 ── */}
        {storeQuery.isError && (
          <div style={{ textAlign: "center", paddingTop: 80 }}>
            <ShopOutlined style={{ fontSize: 48, color: "#cbd5e1" }} />
            <div style={{ marginTop: 16, fontSize: 15, color: "#64748b" }}>
              门店不存在或尚未公开
            </div>
            <Button type="link" onClick={() => router.push("/")}>返回首页</Button>
          </div>
        )}

        {store && (
          <>
            {/* ── 封面 ── */}
            {coverPhoto && (
              <div style={{
                width: "100%", aspectRatio: "16/9", borderRadius: "var(--radius)",
                overflow: "hidden", marginBottom: 16, background: "#f1f5f9"
              }}>
                <img
                  src={coverPhoto.url}
                  alt={store.name}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </div>
            )}

            {/* ── 基本信息 ── */}
            <div className="section-card mb-4" style={{ marginBottom: 16 }}>
              <div style={{ padding: "20px 24px 16px" }}>
                <Typography.Title level={3} style={{ margin: "0 0 8px" }}>
                  {store.name}
                </Typography.Title>

                {store.address && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#64748b", fontSize: 14, marginBottom: 8 }}>
                    <EnvironmentOutlined />
                    <span>{store.address}</span>
                  </div>
                )}

                {store.description && (
                  <>
                    <Divider style={{ margin: "12px 0" }} />
                    <Typography.Paragraph
                      style={{ margin: 0, color: "#475569", fontSize: 14, lineHeight: 1.8 }}
                    >
                      {store.description}
                    </Typography.Paragraph>
                  </>
                )}
              </div>
            </div>

            {/* ── 门店照片 ── */}
            {store.photos.length > 1 && (
              <div className="section-card">
                <div className="section-card-header">
                  <div className="section-card-title">门店照片</div>
                </div>
                <div style={{ padding: "14px 20px 20px" }}>
                  <Image.PreviewGroup>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 8 }}>
                      {store.photos.map((p) => (
                        <div key={p.id} style={{ position: "relative", aspectRatio: "1/1", borderRadius: 8, overflow: "hidden", background: "#f1f5f9" }}>
                          <Image
                            src={p.url}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            preview={{ mask: false }}
                          />
                          {p.isCover && (
                            <span style={{
                              position: "absolute", bottom: 4, left: 4,
                              background: "rgba(0,0,0,0.52)", color: "#fff",
                              fontSize: 10, lineHeight: "16px", padding: "0 5px", borderRadius: 4
                            }}>封面</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Image.PreviewGroup>
                </div>
              </div>
            )}
          </>
        )}
      </Layout.Content>
    </Layout>
  );
}
