import { PermissionPolicy, type UserWithStoreMember } from "../../common/policies/permission.policy";

export class CustomerPolicy {
  static canCreate(user: UserWithStoreMember, storeId: string) {
    return PermissionPolicy.canViewStoreData(user, storeId);
  }

  static canView(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    return PermissionPolicy.canViewCustomer(user, storeId, ownerUserId);
  }

  static canEdit(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    return PermissionPolicy.canEditCustomer(user, storeId, ownerUserId);
  }
}
