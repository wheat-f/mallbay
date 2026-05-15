import { NotImplementedException } from "@nestjs/common";
import * as crypto from "crypto";
import * as path from "path";
import type { MulterFile } from "./multer-file.type";

/**
 * 阿里云 OSS 上传服务
 *
 * 环境变量：
 *   OSS_REGION        e.g. oss-cn-shanghai
 *   OSS_ACCESS_KEY_ID
 *   OSS_ACCESS_KEY_SECRET
 *   OSS_BUCKET
 *   OSS_CDN_HOST      可选，CDN 域名（不含 https://）
 */
export class OssService {
  async uploadAvatar(userId: string, file: MulterFile): Promise<string> {
    const region = process.env.OSS_REGION;
    const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
    const bucket = process.env.OSS_BUCKET;

    if (!region || !accessKeyId || !accessKeySecret || !bucket) {
      throw new NotImplementedException(
        "OSS 未配置，请在环境变量中设置 OSS_REGION / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET / OSS_BUCKET"
      );
    }

    // 延迟 require，避免未安装 ali-oss 时编译 / 启动失败
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const OSS = require("ali-oss") as any;
    const client = new OSS({ region, accessKeyId, accessKeySecret, bucket });

    const ext = path.extname(file.originalname) || ".jpg";
    const key = `avatars/${userId}/${crypto.randomUUID()}${ext}`;

    await client.put(key, file.buffer);

    const cdnHost = process.env.OSS_CDN_HOST;
    if (cdnHost) {
      return `https://${cdnHost}/${key}`;
    }

    return `https://${bucket}.${region}.aliyuncs.com/${key}`;
  }
}
