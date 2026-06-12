import { API_BASE_URL_KEY, AUTH_TOKEN_KEY, STORE_ID_KEY } from "./mini-auth-config";

export { API_BASE_URL_KEY, AUTH_TOKEN_KEY, STORE_ID_KEY };

export type MiniWechatLoginPlatform = {
  login: () => Promise<{ code?: string; errMsg?: string }>;
  request: (options: MiniWechatRequestOptions) => Promise<unknown>;
  setStorageSync: (key: string, value: unknown) => unknown;
};

export type MiniWechatRequestOptions = {
  url: string;
  method?: "GET" | "POST";
  header?: Record<string, string>;
  data?: unknown;
};

export async function loginMiniWithWechat(
  platform: MiniWechatLoginPlatform,
  input: { apiBaseUrl: string }
) {
  const apiBaseUrl = normalizeApiBaseUrl(input.apiBaseUrl);
  if (!apiBaseUrl) {
    throw new Error("请填写 API 地址");
  }

  const loginResult = await platform.login();
  if (!loginResult.code) {
    throw new Error(loginResult.errMsg ?? "微信登录失败");
  }

  const session = normalizeWechatLoginResponse(await platform.request({
    url: `${apiBaseUrl}/auth/wechat-login`,
    method: "POST",
    header: { "Content-Type": "application/json" },
    data: { code: loginResult.code }
  }));
  const profile = normalizeMeResponse(await platform.request({
    url: `${apiBaseUrl}/auth/me`,
    method: "GET",
    header: { Authorization: `Bearer ${session.accessToken}` }
  }));

  platform.setStorageSync(API_BASE_URL_KEY, apiBaseUrl);
  platform.setStorageSync(AUTH_TOKEN_KEY, session.accessToken);
  platform.setStorageSync(STORE_ID_KEY, profile.storeId);
  return { token: session.accessToken, storeId: profile.storeId };
}

function normalizeWechatLoginResponse(response: unknown) {
  if (!response || typeof response !== "object" || typeof (response as { accessToken?: unknown }).accessToken !== "string") {
    throw new Error("微信登录响应缺少 accessToken");
  }
  return { accessToken: (response as { accessToken: string }).accessToken };
}

function normalizeMeResponse(response: unknown) {
  const storeId = (response as { storeMember?: { store?: { id?: unknown } } } | null)?.storeMember?.store?.id;
  if (typeof storeId !== "string" || !storeId) {
    throw new Error("当前账号未关联门店");
  }
  return { storeId };
}

function normalizeApiBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, "");
}
