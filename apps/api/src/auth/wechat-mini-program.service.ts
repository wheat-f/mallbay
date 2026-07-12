import { BadGatewayException, BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type WechatCodeSessionResponse = {
  openid?: string;
  session_key?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
};

@Injectable()
export class WechatMiniProgramService {
  constructor(private readonly config: ConfigService) {}

  async resolveOpenId(code: string) {
    const appId = this.config.get<string>("WECHAT_MINI_APP_ID");
    const secret = this.config.get<string>("WECHAT_MINI_APP_SECRET");
    if (!appId || !secret) {
      throw new BadRequestException("微信小程序登录未配置");
    }

    const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
    url.searchParams.set("appid", appId);
    url.searchParams.set("secret", secret);
    url.searchParams.set("js_code", code);
    url.searchParams.set("grant_type", "authorization_code");

    const response = await fetch(url);
    if (!response.ok) {
      throw new BadGatewayException("微信登录服务暂不可用");
    }

    const data = (await response.json()) as WechatCodeSessionResponse;
    if (!data.openid) {
      throw new UnauthorizedException(data.errmsg ?? "微信登录凭据无效");
    }

    return data.openid;
  }
}
