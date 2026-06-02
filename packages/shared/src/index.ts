export type StorePosition =
  | "MANAGER"
  | "SALES"
  | "PURCHASING"
  | "FINANCE"
  | "SCHEDULER"
  | "CONSTRUCTION"
  | "APPRENTICE";

export type StoreStatus = "DRAFTED" | "PENDING_REVIEW" | "PUBLISHED" | "FROZEN";

export type CustomerType = "PERSONAL" | "COMPANY";

export type Gender = "MALE" | "FEMALE" | "UNKNOWN";

export type CustomerSourceType =
  | "ONLINE_DOUYIN"
  | "ONLINE_XIAOHONGSHU"
  | "ONLINE_KUAISHOU"
  | "OFFLINE_STORE"
  | "REFERRAL"
  | "PARTNER"
  | "OTHER";

export type ProductCategory = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "OTHER";

export type ProductUnit = "ROLL" | "METER" | "PIECE";

export type ProductStatus = "ACTIVE" | "INACTIVE";

export type ConstructionType = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "INSPECTION";

export type ConstructionLocation = "IN_STORE" | "OUTSIDE";

export type OrderStatus =
  | "PENDING_DISPATCH"
  | "DISPATCHED"
  | "IN_CONSTRUCTION"
  | "COMPLETED"
  | "WARRANTIED"
  | "CANCELLED";

export type PaymentType = "DEPOSIT" | "BALANCE" | "FULL";

export type PaymentAccountType = "CORPORATE" | "PERSONAL" | "WECHAT" | "ALIPAY" | "OTHER";

export type ConstructionTaskStatus = "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED";

export type ConstructionPhotoStage = "BEFORE" | "DURING" | "AFTER";

export type QualityCheckResult = "PASS" | "REWORK_REQUIRED";

export type WorkerSkillTag = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "INSPECTION" | "OUTSIDE";

export type InventoryMovementType =
  | "PURCHASE_IN"
  | "ORDER_LOCK"
  | "ORDER_OUT"
  | "STOCK_RELEASE"
  | "STOCK_ADJUST"
  | "DAMAGE"
  | "TRANSFER"
  | "UNIT_CONVERSION";

export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";

export type WarrantyStatus = "ACTIVE" | "EXPIRED" | "VOIDED";

export type AfterSaleStatus = "OPEN" | "ASSIGNED" | "RESOLVED" | "CLOSED" | "CANCELLED";

export type AfterSaleResponsibility = "PENDING" | "CUSTOMER" | "CONSTRUCTION" | "MATERIAL" | "STORE";

export type CommissionRuleType = "FIXED_RATE" | "FIXED_AMOUNT" | "SALES_TIER" | "CONSTRUCTION_TYPE";

export type FinanceApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";

export type PaymentRecordType = "ORDER_PAYMENT" | "EXPENSE" | "REIMBURSEMENT" | "REBATE" | "OTHER";

export type InvoiceStatus = "APPLIED" | "ISSUED" | "VOIDED" | "REISSUED";

export type RebateStatus = "APPLIED" | "APPROVED" | "REJECTED" | "PAID";

export type DailyCapacitySummary = {
  id: string;
  storeId: string;
  date: string;
  inStoreCapacity: number;
  inStoreReserved: number;
  outsideCapacity: number;
  outsideReserved: number;
  heatFilmCapacity: number;
  heatFilmReserved: number;
  inspectionCapacity: number;
  inspectionReserved: number;
};

export type InventoryBatchSummary = {
  id: string;
  storeId: string;
  productId: string;
  batchNo: string;
  supplierName: string | null;
  totalQuantity: number;
  availableQuantity: number;
  lockedQuantity: number;
};

export type WarrantySummary = {
  id: string;
  storeId: string;
  orderId: string;
  warrantyNo: string;
  status: WarrantyStatus;
  scope: string;
  startDate: string;
  endDate: string;
};

export type AfterSaleSummary = {
  id: string;
  storeId: string;
  orderId: string;
  warrantyId: string | null;
  customerId: string;
  description: string;
  status: AfterSaleStatus;
  responsibility: AfterSaleResponsibility;
};

export type SalesCommissionRuleSummary = {
  id: string;
  storeId: string;
  name: string;
  ruleType: CommissionRuleType;
  rateBasisPoints: number | null;
  fixedAmountCents: number | null;
  isActive: boolean;
};

export type ExpenseApplicationSummary = {
  id: string;
  storeId: string;
  title: string;
  amountCents: number;
  reason: string;
  status: FinanceApprovalStatus;
};

export type InvoiceSummary = {
  id: string;
  storeId: string;
  orderId: string;
  title: string;
  amountCents: number;
  status: InvoiceStatus;
  invoiceNo: string | null;
};

export type RebateSummary = {
  id: string;
  storeId: string;
  orderId: string;
  amountCents: number;
  reason: string;
  status: RebateStatus;
};

export type ReportSummary = {
  orders: number;
  totalAmountCents: number;
  paidAmountCents: number;
  constructionRecords: number;
  afterSales: number;
  invoices: number;
  rebates: number;
};

export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  email: string | null;
  phone: string | null;
  wechatOpenId: string | null;
  alipayUserId: string | null;
  isAuditor: boolean;
  // 仅 /auth/me 返回，登录/刷新时为 undefined
  storeMember?: {
    position: StorePosition;
    store: { id: string; name: string; status: StoreStatus };
  } | null;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

export type AuthResponse = AuthTokens & {
  user: AuthUser;
};

/** identifier 可以是 username 或已绑定的 email / phone */
export type LoginPayload = {
  identifier: string;
  password: string;
};

export type RegisterPayload = {
  username: string;
  password: string;
};

export type EncryptedLoginPayload = {
  identifier: string;
  encryptedPassword: string;
};

export type EncryptedRegisterPayload = {
  username: string;
  encryptedPassword: string;
};

export type AuthPublicKeyResponse = {
  algorithm: "RSA-OAEP-256";
  publicKey: string;
};

export type UpdateProfilePayload = {
  nickname?: string;
};

export type ChangePasswordPayload = {
  oldPassword: string;
  newPassword: string;
};

export type BindEmailPayload = {
  email: string;
};

export type BindPhonePayload = {
  phone: string;
};
