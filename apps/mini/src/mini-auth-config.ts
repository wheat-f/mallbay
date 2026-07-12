export const API_BASE_URL_KEY = "mallbay_api_base_url";
export const AUTH_TOKEN_KEY = "mallbay_access_token";
export const STORE_ID_KEY = "mallbay_store_id";

export type MiniAuthConfig = {
  apiBaseUrl: string;
  token: string;
  storeId: string;
};

export type MiniConfigStorage = {
  getStorageSync: (key: string) => unknown;
  setStorageSync: (key: string, value: unknown) => unknown;
};

export function validateMiniAuthConfig(input: Partial<MiniAuthConfig>) {
  const value = {
    apiBaseUrl: normalizeApiBaseUrl(input.apiBaseUrl),
    token: trimValue(input.token),
    storeId: trimValue(input.storeId)
  };
  if (!value.apiBaseUrl) return { ok: false as const, message: "请填写 API 地址" };
  if (!value.token) return { ok: false as const, message: "请填写 access token" };
  if (!value.storeId) return { ok: false as const, message: "请填写门店 ID" };
  return { ok: true as const, value };
}

export function saveMiniAuthConfig(storage: MiniConfigStorage, input: Partial<MiniAuthConfig>) {
  const result = validateMiniAuthConfig(input);
  if (!result.ok) return result;
  storage.setStorageSync(API_BASE_URL_KEY, result.value.apiBaseUrl);
  storage.setStorageSync(AUTH_TOKEN_KEY, result.value.token);
  storage.setStorageSync(STORE_ID_KEY, result.value.storeId);
  return { ok: true as const };
}

export function getMiniAuthConfig(storage: Pick<MiniConfigStorage, "getStorageSync">): MiniAuthConfig {
  return {
    apiBaseUrl: String(storage.getStorageSync(API_BASE_URL_KEY) ?? ""),
    token: String(storage.getStorageSync(AUTH_TOKEN_KEY) ?? ""),
    storeId: String(storage.getStorageSync(STORE_ID_KEY) ?? "")
  };
}

function normalizeApiBaseUrl(value?: string) {
  return trimValue(value).replace(/\/+$/, "");
}

function trimValue(value?: string) {
  return (value ?? "").trim();
}
