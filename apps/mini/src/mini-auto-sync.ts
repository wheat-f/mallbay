import { getMiniAuthConfig } from "./mini-auth-config";
import {
  OFFLINE_QUEUE_KEY,
  MiniConstructionApi,
  type MiniPlatform
} from "./mini-construction-api";

export const AUTO_SYNC_LAST_AT_KEY = "mallbay_auto_sync_last_at";
export const AUTO_SYNC_INTERVAL_MS = 60_000;

export type MiniAutoSyncOptions = {
  nowMs: number;
  intervalMs?: number;
};

export async function runMiniAutoSync(platform: MiniPlatform, options: MiniAutoSyncOptions) {
  const config = getMiniAuthConfig(platform);
  if (!config.apiBaseUrl || !config.token || !config.storeId) {
    return { status: "SKIPPED" as const, reason: "MISSING_CONFIG" as const };
  }

  const queue = platform.getStorageSync(OFFLINE_QUEUE_KEY);
  if (!Array.isArray(queue) || queue.length === 0) {
    return { status: "SKIPPED" as const, reason: "EMPTY_QUEUE" as const };
  }

  const intervalMs = options.intervalMs ?? AUTO_SYNC_INTERVAL_MS;
  const lastAt = Number(platform.getStorageSync(AUTO_SYNC_LAST_AT_KEY) ?? 0);
  if (lastAt > 0 && options.nowMs - lastAt < intervalMs) {
    return { status: "SKIPPED" as const, reason: "TOO_SOON" as const };
  }

  const result = await new MiniConstructionApi(platform).syncOfflineQueue({
    apiBaseUrl: config.apiBaseUrl,
    token: config.token
  });
  platform.setStorageSync(AUTO_SYNC_LAST_AT_KEY, options.nowMs);
  return { status: "SYNCED" as const, ...result };
}
