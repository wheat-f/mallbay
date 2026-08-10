import { Injectable } from "@nestjs/common";

type RuntimeAccessSnapshot = {
  permissions: Array<{
    code: string;
    actions: string[];
    scopes: string[];
    bindingScopes?: Array<{ scopeType: string; scopeIds: string[] }>;
  }>;
  roles: Array<{ roleCode: string; scopeType: string; scopeIds: string[] }>;
};

/** Internal cache for permission resolution; callers must use AccessContext. */
@Injectable()
export class RuntimeAccessSnapshotStore {
  private readonly snapshots = new Map<string, RuntimeAccessSnapshot>();

  set(userId: string, snapshot: RuntimeAccessSnapshot) {
    this.snapshots.set(userId, snapshot);
  }

  has(userId: string) {
    return this.snapshots.has(userId);
  }

  clear(userId: string) {
    this.snapshots.delete(userId);
  }

  clearAll() {
    this.snapshots.clear();
  }
}
