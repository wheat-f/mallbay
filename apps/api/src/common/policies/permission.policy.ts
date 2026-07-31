import { StorePosition } from "@prisma/client";

const CUSTOMER_SERVICE = "CUSTOMER_SERVICE" as StorePosition;

export type UserWithStoreMember = {
  id: string;
  isAuditor: boolean;
  storeMember?: {
    storeId: string;
    position: StorePosition;
  } | null;
};

export type CustomerScope =
  | { all: true }
  | { storeId: string }
  | { storeId: string; ownerUserId: string };

export type OrderScope =
  | { all: true }
  | { storeId: string }
  | { storeId: string; salesPersonId: string }
  | { storeId: string; assignedWorkerId: string };

export class PermissionPolicy {
  private static readonly runtimeSnapshots = new Map<string, { permissions: Array<{ code: string; actions: string[]; scopes: string[]; bindingScopes?: Array<{ scopeType: string; scopeIds: string[] }> }>; roles: Array<{ roleCode: string; scopeType: string; scopeIds: string[] }> }>();

  static setRuntimeSnapshot(userId: string, snapshot: { permissions: Array<{ code: string; actions: string[]; scopes: string[]; bindingScopes?: Array<{ scopeType: string; scopeIds: string[] }> }>; roles: Array<{ roleCode: string; scopeType: string; scopeIds: string[] }> }) {
    this.runtimeSnapshots.set(userId, snapshot);
  }

  static hasRuntimeSnapshot(userId: string) {
    return this.runtimeSnapshots.has(userId);
  }

  static hasRuntimeRole(user: UserWithStoreMember, roleCodes: string[], storeId?: string) {
    const snapshot = this.runtimeSnapshots.get(user.id);
    if (!snapshot) return undefined;
    return snapshot.roles.some((role) => roleCodes.includes(role.roleCode) && (role.scopeType === "HQ" || !storeId || role.scopeIds.includes(storeId)));
  }
  static canRuntime(user: UserWithStoreMember, resource: string, action: string, storeId: string, ownerId?: string) {
    return this.runtimeAllows(user, resource, action, storeId, ownerId) === true;
  }

  private static runtimeAllows(user: UserWithStoreMember, resource: string, action: string, storeId: string, ownerId?: string) {
    const snapshot = this.runtimeSnapshots.get(user.id);
    if (!snapshot) return undefined;
    return snapshot.permissions.some((permission) => {
      if (permission.code !== resource && permission.code !== resource + "." + action) return false;
      if (!permission.actions.includes(action)) return false;
      const bindingScopes = permission.bindingScopes ?? snapshot.roles.map((role) => ({
        scopeType: role.scopeType,
        scopeIds: role.scopeIds
      }));
      return bindingScopes.some((binding) => {
        const coversStore = binding.scopeType === "HQ" ||
          Boolean(storeId && binding.scopeIds.includes(storeId));
        if (!coversStore) return false;
        if (permission.scopes.includes("GLOBAL") && binding.scopeType === "HQ") return true;
        if (permission.scopes.includes("STORE") && Boolean(storeId)) return true;
        return permission.scopes.includes("OWN") && ownerId === user.id && Boolean(storeId);
      });
    });
  }


  private static readonly orderCreators: StorePosition[] = [StorePosition.MANAGER, StorePosition.SALES, CUSTOMER_SERVICE];
  private static readonly customerViewers: StorePosition[] = [StorePosition.FINANCE, StorePosition.SCHEDULER, CUSTOMER_SERVICE];
  private static readonly constructionWorkers: StorePosition[] = [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE];
  private static readonly inventoryViewers: StorePosition[] = [StorePosition.MANAGER, StorePosition.PURCHASING, CUSTOMER_SERVICE];
  private static readonly inventoryManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.PURCHASING];
  private static readonly purchaseViewers: StorePosition[] = [StorePosition.MANAGER, StorePosition.PURCHASING, StorePosition.FINANCE, CUSTOMER_SERVICE];
  private static readonly purchaseManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.PURCHASING];
  private static readonly productManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.PURCHASING];
  private static readonly warrantyCreators: StorePosition[] = [StorePosition.MANAGER, StorePosition.SCHEDULER, CUSTOMER_SERVICE];
  private static readonly afterSalesManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.SCHEDULER, CUSTOMER_SERVICE];
  private static readonly commissionManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.FINANCE];
  private static readonly financeManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.FINANCE];
  private static readonly invoiceApplicants: StorePosition[] = [StorePosition.MANAGER, StorePosition.SALES, StorePosition.FINANCE];
  private static readonly rebateApplicants: StorePosition[] = [StorePosition.MANAGER, StorePosition.SALES, CUSTOMER_SERVICE];

  static isAdmin(user: UserWithStoreMember) {
    const snapshot = this.runtimeSnapshots.get(user.id);
    if (snapshot) return snapshot.roles.some((role) => role.scopeType === "HQ") && this.runtimeAllows(user, "settings", "write", "__hq__") === true;

    return user.isAuditor;
  }

  static isStoreMember(user: UserWithStoreMember, storeId: string) {
    const snapshot = this.runtimeSnapshots.get(user.id);
    if (snapshot) return snapshot.roles.some((role) => role.scopeType === "HQ" || (role.scopeType === "STORE" && role.scopeIds.includes(storeId)));

    return user.storeMember?.storeId === storeId;
  }

  static isStoreManager(user: UserWithStoreMember, storeId: string) {
    const snapshot = this.runtimeSnapshots.get(user.id);
    if (snapshot) return this.runtimeAllows(user, "store", "write", storeId) === true;

    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.MANAGER
    );
  }

  static canViewStoreData(user: UserWithStoreMember, storeId: string) {
    const snapshot = this.runtimeSnapshots.get(user.id);
    if (snapshot) return this.runtimeAllows(user, "store", "read", storeId) === true;

    return this.isAdmin(user) || this.isStoreMember(user, storeId);
  }

  static canCreateOrder(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "orders", "write", storeId); if (runtime !== undefined) return runtime;
    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) &&
      this.orderCreators.includes(user.storeMember!.position)
    );
  }

  static canViewCustomer(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    const runtime = this.runtimeAllows(user, "customers", "read", storeId, ownerUserId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    if (!this.isStoreMember(user, storeId)) return false;
    if (user.storeMember?.position === StorePosition.SALES) return ownerUserId === user.id;
    return this.customerViewers.includes(user.storeMember!.position);
  }

  static canEditCustomer(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    const runtime = this.runtimeAllows(user, "customers", "write", storeId, ownerUserId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === CUSTOMER_SERVICE) return true;
    return this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.SALES &&
      ownerUserId === user.id;
  }

  static canManageOrderPayment(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.FINANCE;
  }

  static canDispatchConstruction(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "construction", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SCHEDULER;
  }

  static canWorkOnConstructionTask(
    user: UserWithStoreMember,
    storeId: string,
    assignedWorkerId: string
  ) {
    const runtime = this.runtimeAllows(user, "construction", "write", storeId, assignedWorkerId); if (runtime !== undefined) return runtime;
    return this.isStoreMember(user, storeId) &&
      this.constructionWorkers.includes(user.storeMember!.position) &&
      user.id === assignedWorkerId;
  }

  static canUploadConstructionPhoto(
    user: UserWithStoreMember,
    storeId: string,
    assignedWorkerId: string
  ) {
    const runtime = this.runtimeAllows(user, "construction", "write", storeId, assignedWorkerId); if (runtime !== undefined) return runtime;
    return this.canDispatchConstruction(user, storeId) ||
      this.canWorkOnConstructionTask(user, storeId, assignedWorkerId);
  }

  static canQualityCheckConstruction(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "construction", "write", storeId); if (runtime !== undefined) return runtime;
    return this.canDispatchConstruction(user, storeId);
  }

  static canManageInventory(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "inventory", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.inventoryManagers.includes(user.storeMember!.position);
  }

  static canViewInventory(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "inventory", "read", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.inventoryViewers.includes(user.storeMember!.position);
  }

  static canViewPurchase(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "purchase", "read", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.purchaseViewers.includes(user.storeMember!.position);
  }

  static canManagePurchase(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "purchase", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.purchaseManagers.includes(user.storeMember!.position);
  }

  static canManageProduct(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "products", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.productManagers.includes(user.storeMember!.position);
  }

  static canCreateWarranty(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "warranties", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.warrantyCreators.includes(user.storeMember!.position);
  }

  static canViewWarranty(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "warranties", "read", storeId); if (runtime !== undefined) return runtime;
    return this.canViewStoreData(user, storeId);
  }

  static canManageAfterSales(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "after-sales", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.afterSalesManagers.includes(user.storeMember!.position);
  }

  static canManageCommission(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "commissions", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.commissionManagers.includes(user.storeMember!.position);
  }

  static canManageFinance(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.financeManagers.includes(user.storeMember!.position);
  }

  static canViewOwnFinanceApplication(user: UserWithStoreMember, storeId: string, applicantId: string) {
    const runtime = this.runtimeAllows(user, "finance", "read", storeId, applicantId); if (runtime !== undefined) return runtime;
    return this.isAdmin(user) || (this.isStoreMember(user, storeId) && user.id === applicantId);
  }

  static canViewAllFinanceApplications(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "read", storeId); if (runtime !== undefined) return runtime;
    return this.canManageFinance(user, storeId);
  }

  static canReviewExpense(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    return this.isAdmin(user) || this.isStoreManager(user, storeId);
  }

  static canReviewReimbursement(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.FINANCE
    );
  }

  static canPayReimbursement(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    return this.canReviewReimbursement(user, storeId);
  }

  static canSubmitFinanceApplication(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    // 费用申请是全员可发起的门店流程：申请人只能查看本人，店长审批，财务付款入账。
    return this.isAdmin(user) || this.isStoreMember(user, storeId);
  }

  static canApplyInvoice(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.invoiceApplicants.includes(user.storeMember!.position);
  }

  static canApplyInvoiceForOrder(user: UserWithStoreMember, storeId: string, salesPersonId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId, salesPersonId); if (runtime !== undefined) return runtime;
    if (!this.canApplyInvoice(user, storeId)) return false;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.FINANCE) return true;
    return this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.SALES &&
      user.id === salesPersonId;
  }

  static canManageInvoice(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    return this.canManageFinance(user, storeId);
  }

  static canApplyRebate(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.rebateApplicants.includes(user.storeMember!.position);
  }

  static canApplyRebateForOrder(user: UserWithStoreMember, storeId: string, salesPersonId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId, salesPersonId); if (runtime !== undefined) return runtime;
    if (!this.canApplyRebate(user, storeId)) return false;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === CUSTOMER_SERVICE) return true;
    return this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.SALES &&
      user.id === salesPersonId;
  }

  static canReviewRebate(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    return this.isAdmin(user) || this.isStoreManager(user, storeId);
  }

  static canApproveRebate(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "finance", "write", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.FINANCE;
  }

  static canViewReports(user: UserWithStoreMember, storeId: string) {
    const runtime = this.runtimeAllows(user, "reports", "read", storeId); if (runtime !== undefined) return runtime;
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) &&
      (user.storeMember?.position === StorePosition.FINANCE || user.storeMember?.position === StorePosition.SALES);
  }

  static getCustomerScope(user: UserWithStoreMember, storeId: string): CustomerScope {
    if (this.isAdmin(user)) return { all: true };
    if (this.isStoreManager(user, storeId)) return { storeId };
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SALES) {
      return { storeId, ownerUserId: user.id };
    }
    return { storeId };
  }

  static getOrderScope(user: UserWithStoreMember, storeId: string): OrderScope {
    if (this.isAdmin(user)) return { all: true };
    if (this.isStoreManager(user, storeId)) return { storeId };
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SALES) {
      return { storeId, salesPersonId: user.id };
    }
    if (this.isStoreMember(user, storeId) && this.constructionWorkers.includes(user.storeMember!.position)) {
      return { storeId, assignedWorkerId: user.id };
    }
    return { storeId };
  }
}
