export type OfflineOperationType = "PHOTO_UPLOAD" | "TASK_STATUS" | "LEAVE_REQUEST";
export type OfflineOperationStatus = "PENDING" | "SYNCING" | "FAILED";

export type OfflineOperation = {
  id: string;
  type: OfflineOperationType;
  payload: Record<string, unknown>;
  attempts: number;
  status: OfflineOperationStatus;
  createdAt: string;
  lastError?: string;
};

export type OfflineQueueOptions = {
  maxItems: number;
  maxRetries: number;
};

export interface OfflineStorage {
  read(): Promise<OfflineOperation[]>;
  write(items: OfflineOperation[]): Promise<void>;
}

export class MemoryOfflineStorage implements OfflineStorage {
  private items: OfflineOperation[] = [];

  async read() {
    return [...this.items];
  }

  async write(items: OfflineOperation[]) {
    this.items = [...items];
  }
}

export class OfflineQueue {
  constructor(
    private readonly storage: OfflineStorage,
    private readonly options: OfflineQueueOptions
  ) {}

  async enqueue(input: { type: OfflineOperationType; payload: Record<string, unknown> }) {
    const items = await this.storage.read();
    if (items.length >= this.options.maxItems) {
      throw new Error("本地缓存已达上限，请联网同步后再继续操作");
    }
    const item: OfflineOperation = {
      id: createId(),
      type: input.type,
      payload: input.payload,
      attempts: 0,
      status: "PENDING",
      createdAt: new Date().toISOString()
    };
    await this.storage.write([...items, item]);
    return item;
  }

  async list() {
    return this.storage.read();
  }

  async flush(sync: (item: OfflineOperation) => Promise<unknown>) {
    const items = await this.storage.read();
    const remaining: OfflineOperation[] = [];
    for (const item of items) {
      if (item.status === "FAILED") {
        remaining.push(item);
        continue;
      }
      try {
        await sync({ ...item, status: "SYNCING" });
      } catch (error) {
        const attempts = item.attempts + 1;
        remaining.push({
          ...item,
          attempts,
          status: attempts >= this.options.maxRetries ? "FAILED" : "PENDING",
          lastError: error instanceof Error ? error.message : "同步失败"
        });
      }
    }
    await this.storage.write(remaining);
  }
}

function createId() {
  return `offline_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
