import { Injectable, InternalServerErrorException, Optional } from "@nestjs/common";
import * as crypto from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { TraceService } from "../observability/trace.service";
import type { MulterFile } from "./multer-file.type";

/**
 * 阿里云 OSS 上传服务
 *
 * 必须配置的环境变量：
 *   OSS_REGION        e.g. oss-cn-shanghai
 *   OSS_ACCESS_KEY_ID
 *   OSS_ACCESS_KEY_SECRET
 *   OSS_BUCKET
 *   OSS_CDN_HOST      可选，CDN 域名（不含 https://）
 *
 * 本地开发可设置：
 *   OSS_PROVIDER=local
 *   OSS_LOCAL_DIR=.local/oss
 *   OSS_PUBLIC_BASE_URL=http://localhost:4001/local-oss
 */
@Injectable()
export class OssService {
  constructor(@Optional() private readonly trace?: TraceService) {}

  private isLocalProvider() {
    return process.env.OSS_PROVIDER === "local";
  }

  private getClient() {
    const { OSS_REGION: region, OSS_ACCESS_KEY_ID: accessKeyId,
      OSS_ACCESS_KEY_SECRET: accessKeySecret, OSS_BUCKET: bucket } = process.env;

    if (!region || !accessKeyId || !accessKeySecret || !bucket) {
      throw new InternalServerErrorException(
        "OSS 未配置，请检查环境变量：OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET"
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const OSS = require("ali-oss") as any;
    return { client: new OSS({ region, accessKeyId, accessKeySecret, bucket }), bucket, region };
  }

  private getLocalRoot() {
    return path.resolve(process.env.OSS_LOCAL_DIR ?? ".local/oss");
  }

  private buildUrl(key: string, bucket: string, region: string): string {
    const cdnHost = process.env.OSS_CDN_HOST;
    return cdnHost
      ? `https://${cdnHost}/${key}`
      : `https://${bucket}.${region}.aliyuncs.com/${key}`;
  }

  private buildLocalUrl(key: string): string {
    const baseUrl = process.env.OSS_PUBLIC_BASE_URL ?? "http://localhost:4001/local-oss";
    return `${baseUrl.replace(/\/$/, "")}/${key.split("/").map(encodeURIComponent).join("/")}`;
  }

  private async putLocalObject(key: string, buffer: Buffer) {
    const targetPath = path.join(this.getLocalRoot(), key);
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, buffer);
  }

  private extractConfiguredObjectKey(url: string) {
    try {
      const parsed = new URL(url);
      if (this.isLocalProvider()) {
        const basePath = new URL(process.env.OSS_PUBLIC_BASE_URL ?? "http://localhost:4001/local-oss").pathname.replace(/\/$/, "") + "/";
        if (!parsed.pathname.startsWith(basePath)) return undefined;
        return parsed.pathname.slice(basePath.length).split("/").map((part) => decodeURIComponent(part)).join("/");
      }

      const bucket = process.env.OSS_BUCKET;
      const region = process.env.OSS_REGION;
      const cdnHost = process.env.OSS_CDN_HOST;
      const expectedHost = cdnHost || (bucket && region ? `${bucket}.${region}.aliyuncs.com` : undefined);
      if (!expectedHost || parsed.hostname !== expectedHost) return undefined;
      return parsed.pathname.replace(/^\/+/, "").split("/").map((part) => decodeURIComponent(part)).join("/");
    } catch {
      return undefined;
    }
  }

  async uploadAvatar(userId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "avatar", userId, bytes: file.buffer.length },
      async () => {
        const ext = path.extname(file.originalname) || ".jpg";
        const key = `avatars/${userId}/${crypto.randomUUID()}${ext}`;
        if (this.isLocalProvider()) {
          await this.putLocalObject(key, file.buffer);
          return this.buildLocalUrl(key);
        }
        const { client, bucket, region } = this.getClient();
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  async uploadStorePhoto(storeId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "store_photo", storeId, bytes: file.buffer.length },
      async () => {
        const ext = path.extname(file.originalname) || ".jpg";
        const key = `stores/${storeId}/${crypto.randomUUID()}${ext}`;
        if (this.isLocalProvider()) {
          await this.putLocalObject(key, file.buffer);
          return this.buildLocalUrl(key);
        }
        const { client, bucket, region } = this.getClient();
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  async uploadVehiclePhoto(userId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "vehicle_photo", userId, bytes: file.buffer.length },
      async () => {
        const ext = path.extname(file.originalname) || ".jpg";
        const key = `vehicles/${userId}/${crypto.randomUUID()}${ext}`;
        if (this.isLocalProvider()) {
          await this.putLocalObject(key, file.buffer);
          return this.buildLocalUrl(key);
        }
        const { client, bucket, region } = this.getClient();
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  async uploadConstructionPhoto(storeId: string, orderId: string, file: MulterFile, clientOperationId?: string): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "construction_photo", storeId, orderId, bytes: file.buffer.length },
      async () => {
        const ext = path.extname(file.originalname) || ".jpg";
        const stableToken = clientOperationId?.trim().replace(/[^a-zA-Z0-9._-]/g, "").slice(0, 128);
        const key = `construction/${storeId}/${orderId}/${stableToken || crypto.randomUUID()}${ext}`;
        if (this.isLocalProvider()) {
          await this.putLocalObject(key, file.buffer);
          return this.buildLocalUrl(key);
        }
        const { client, bucket, region } = this.getClient();
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  async uploadAfterSalePhoto(storeId: string, afterSaleId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "after_sale_photo", storeId, afterSaleId, bytes: file.buffer.length },
      async () => {
        const ext = path.extname(file.originalname) || ".jpg";
        const key = `after-sales/${storeId}/${afterSaleId}/${crypto.randomUUID()}${ext}`;
        if (this.isLocalProvider()) {
          await this.putLocalObject(key, file.buffer);
          return this.buildLocalUrl(key);
        }
        const { client, bucket, region } = this.getClient();
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  async uploadFinanceAttachment(storeId: string, applicationId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "finance_attachment", storeId, applicationId, bytes: file.buffer.length },
      async () => {
        const ext = path.extname(file.originalname) || ".bin";
        const key = `finance/${storeId}/${applicationId}/${crypto.randomUUID()}${ext}`;
        if (this.isLocalProvider()) {
          await this.putLocalObject(key, file.buffer);
          return this.buildLocalUrl(key);
        }
        const { client, bucket, region } = this.getClient();
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  /** Remove only a construction object belonging to the configured provider. */
  async removeConstructionPhoto(url: string): Promise<void> {
    const key = this.extractConfiguredObjectKey(url);
    if (!key || !key.startsWith("construction/")) return;

    if (this.isLocalProvider()) {
      const root = path.resolve(this.getLocalRoot());
      const target = path.resolve(root, ...key.split("/"));
      if (target !== root && !target.startsWith(`${root}${path.sep}`)) return;
      await fs.rm(target, { force: true });
      return;
    }

    const { client } = this.getClient();
    await client.delete(key);
  }

  private traceUpload(fields: Record<string, unknown>, callback: () => Promise<string>) {
    return this.trace?.traceOperation("oss.upload", fields, callback) ?? callback();
  }
}
