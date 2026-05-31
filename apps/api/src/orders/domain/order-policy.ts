import { PermissionPolicy, type UserWithStoreMember } from "../../common/policies/permission.policy";

export class OrderPolicy {
  static canCreate(user: UserWithStoreMember, storeId: string) {
    return PermissionPolicy.canCreateOrder(user, storeId);
  }

  static canViewStoreOrders(user: UserWithStoreMember, storeId: string) {
    return PermissionPolicy.canViewStoreData(user, storeId);
  }

  static canManagePayment(user: UserWithStoreMember, storeId: string) {
    return PermissionPolicy.canManageOrderPayment(user, storeId);
  }
}
