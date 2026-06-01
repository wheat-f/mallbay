import { StorePosition } from "@prisma/client";

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
  private static readonly orderCreators: StorePosition[] = [StorePosition.MANAGER, StorePosition.SALES];
  private static readonly customerViewers: StorePosition[] = [StorePosition.FINANCE, StorePosition.SCHEDULER];
  private static readonly constructionWorkers: StorePosition[] = [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE];
  private static readonly inventoryManagers: StorePosition[] = [StorePosition.MANAGER, StorePosition.PURCHASING];
  private static readonly warrantyCreators: StorePosition[] = [StorePosition.MANAGER, StorePosition.SCHEDULER];

  static isAdmin(user: UserWithStoreMember) {
    return user.isAuditor;
  }

  static isStoreMember(user: UserWithStoreMember, storeId: string) {
    return user.storeMember?.storeId === storeId;
  }

  static isStoreManager(user: UserWithStoreMember, storeId: string) {
    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.MANAGER
    );
  }

  static canViewStoreData(user: UserWithStoreMember, storeId: string) {
    return this.isAdmin(user) || this.isStoreMember(user, storeId);
  }

  static canCreateOrder(user: UserWithStoreMember, storeId: string) {
    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) &&
      this.orderCreators.includes(user.storeMember!.position)
    );
  }

  static canViewCustomer(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    if (!this.isStoreMember(user, storeId)) return false;
    if (user.storeMember?.position === StorePosition.SALES) return ownerUserId === user.id;
    return this.customerViewers.includes(user.storeMember!.position);
  }

  static canEditCustomer(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.SALES &&
      ownerUserId === user.id;
  }

  static canManageOrderPayment(user: UserWithStoreMember, storeId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.FINANCE;
  }

  static canDispatchConstruction(user: UserWithStoreMember, storeId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SCHEDULER;
  }

  static canWorkOnConstructionTask(
    user: UserWithStoreMember,
    storeId: string,
    assignedWorkerId: string
  ) {
    return this.isStoreMember(user, storeId) &&
      this.constructionWorkers.includes(user.storeMember!.position) &&
      user.id === assignedWorkerId;
  }

  static canUploadConstructionPhoto(
    user: UserWithStoreMember,
    storeId: string,
    assignedWorkerId: string
  ) {
    return this.canWorkOnConstructionTask(user, storeId, assignedWorkerId);
  }

  static canQualityCheckConstruction(user: UserWithStoreMember, storeId: string) {
    return this.canDispatchConstruction(user, storeId);
  }

  static canManageInventory(user: UserWithStoreMember, storeId: string) {
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.inventoryManagers.includes(user.storeMember!.position);
  }

  static canCreateWarranty(user: UserWithStoreMember, storeId: string) {
    if (this.isAdmin(user)) return true;
    return this.isStoreMember(user, storeId) &&
      this.warrantyCreators.includes(user.storeMember!.position);
  }

  static canViewWarranty(user: UserWithStoreMember, storeId: string) {
    return this.canViewStoreData(user, storeId);
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
