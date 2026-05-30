import { Injectable, InternalServerErrorException, Optional } from "@nestjs/common";
import * as crypto from "crypto";
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
 */
@Injectable()
export class OssService {
  constructor(@Optional() private readonly trace?: TraceService) {}

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

  private buildUrl(key: string, bucket: string, region: string): string {
    const cdnHost = process.env.OSS_CDN_HOST;
    return cdnHost
      ? `https://${cdnHost}/${key}`
      : `https://${bucket}.${region}.aliyuncs.com/${key}`;
  }

  async uploadAvatar(userId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "avatar", userId, bytes: file.buffer.length },
      async () => {
        const { client, bucket, region } = this.getClient();
        const ext = path.extname(file.originalname) || ".jpg";
        const key = `avatars/${userId}/${crypto.randomUUID()}${ext}`;
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  async uploadStorePhoto(storeId: string, file: MulterFile): Promise<string> {
    return this.traceUpload(
      { component: "oss", target: "store_photo", storeId, bytes: file.buffer.length },
      async () => {
        const { client, bucket, region } = this.getClient();
        const ext = path.extname(file.originalname) || ".jpg";
        const key = `stores/${storeId}/${crypto.randomUUID()}${ext}`;
        await client.put(key, file.buffer);
        return this.buildUrl(key, bucket, region);
      }
    );
  }

  private traceUpload(fields: Record<string, unknown>, callback: () => Promise<string>) {
    return this.trace?.traceOperation("oss.upload", fields, callback) ?? callback();
  }
}
