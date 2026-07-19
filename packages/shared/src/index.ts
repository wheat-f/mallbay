export type StorePosition =
  | "MANAGER"
  | "SALES"
  | "CUSTOMER_SERVICE"
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

export type CustomerNoteType = "PREFERENCE" | "REQUIREMENT" | "COMMUNICATION";

export type ProductCategory = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "OTHER";

export type ProductUnit = "ROLL" | "METER" | "SQUARE_METER" | "SQUARE_CENTIMETER" | "PIECE";

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

export type ScheduleStatus = "WORKING" | "REST" | "OUTSIDE";

export type ScheduleSummary = {
  id: string;
  storeId: string;
  workerId: string;
  date: string;
  status: ScheduleStatus;
  note?: string | null;
  worker?: {
    username?: string | null;
    nickname?: string | null;
  } | null;
};

export type OfflineSyncOperationType = "PHOTO_UPLOAD" | "TASK_STATUS" | "LEAVE_REQUEST";

export type OfflineSyncOperation = {
  clientOperationId: string;
  type: OfflineSyncOperationType;
  payload: Record<string, unknown>;
};

export type OfflineSyncItemResult = {
  clientOperationId: string;
  status: "SYNCED" | "FAILED";
  message?: string;
  result?: unknown;
};

export type OfflineSyncResult = {
  items: OfflineSyncItemResult[];
};

export type InventoryMovementType =
  | "PURCHASE_IN"
  | "ORDER_LOCK"
  | "ORDER_OUT"
  | "STOCK_RELEASE"
  | "STOCK_ADJUST"
  | "DAMAGE"
  | "TRANSFER"
  | "COUNT_IN"
  | "COUNT_OUT"
  | "DAMAGE_OUT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "RETURN_IN"
  | "RETURN_OUT"
  | "UNIT_CONVERSION"
  | "BATCH_SPLIT";

export type InventoryAllocationStatus = "LOCKED" | "OUTBOUND" | "RELEASED";

export type PurchaseRequirementStatus =
  | "OPEN"
  | "PARTIAL_ORDERED"
  | "ORDERED"
  | "PARTIAL_RECEIVED"
  | "FULFILLED"
  | "CANCELLED";

export type PurchaseOrderStatus = "DRAFT" | "ORDERED" | "PARTIAL_RECEIVED" | "RECEIVED" | "CANCELLED";

export type WarrantyStatus = "ACTIVE" | "EXPIRED" | "VOIDED";

export type AfterSaleStatus = "OPEN" | "ASSIGNED" | "RESOLVED" | "CLOSED" | "CANCELLED";

export type AfterSaleResponsibility = "PENDING" | "CUSTOMER" | "CONSTRUCTION" | "MATERIAL" | "STORE";

export type AfterSalePhotoStage = "ISSUE" | "CONSTRUCTION_AFTER" | "SUPPLEMENT";

export type CommissionRuleType = "FIXED_RATE" | "FIXED_AMOUNT" | "SALES_TIER" | "CONSTRUCTION_TYPE";

export type FinanceApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "PAID" | "CANCELLED";

export type PaymentRecordType = "ORDER_PAYMENT" | "EXPENSE" | "REIMBURSEMENT" | "REBATE" | "OTHER";

export type PaymentDirection = "INCOME" | "EXPENSE";

export type FinanceApplicationType = "EXPENSE" | "REIMBURSEMENT";

export type FinanceApprovalNode = "MANAGER_REVIEW" | "FINANCE_REVIEW" | "PAYMENT";

export type FinanceApprovalAction =
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN"
  | "RESUBMITTED"
  | "PAID";

export type FinanceAttachmentCategory = "INVOICE" | "CONTRACT" | "PAYMENT_PROOF" | "OTHER";

export type FinanceAllowedAction =
  | "REVIEW_EXPENSE"
  | "WITHDRAW"
  | "RESUBMIT"
  | "CREATE_REIMBURSEMENT"
  | "REVIEW_REIMBURSEMENT"
  | "PAY"
  | "UPLOAD_ATTACHMENT";

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};

export type InvoiceStatus = "APPLIED" | "ISSUED" | "VOIDED" | "REISSUED";

export type RebateStatus = "APPLIED" | "REVIEWED" | "APPROVED" | "REJECTED" | "PAID";

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
  warehouseId?: string | null;
  warehouseName?: string | null;
  unit: ProductUnit;
  packageUnit?: ProductUnit | null;
  packageQuantity?: number | string | null;
  baseUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | string | null;
  totalQuantity: number;
  availableQuantity: number;
  lockedQuantity: number;
  outboundQuantity: number;
  receivedAt?: string | null;
  product?: {
    brand?: string | null;
    name?: string | null;
    model?: string | null;
    category?: ProductCategory | null;
    specification?: string | null;
    inventoryUnit?: ProductUnit | null;
    salesUnit?: ProductUnit | null;
    rollWidthMeters?: number | string | null;
    rollLengthMeters?: number | string | null;
    metersPerRoll?: number | string | null;
    quantityPrecision?: number | null;
    warrantyYears?: number | null;
  } | null;
};

export type InventoryWarehouseSummary = {
  id: string;
  storeId: string;
  name: string;
  code?: string | null;
  area?: string | null;
  address?: string | null;
  isActive: boolean;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type InventorySupplierSummary = {
  id?: string;
  storeId?: string;
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  settlementCycle?: string | null;
  rating?: number | null;
  note?: string | null;
  isActive?: boolean;
  contacts?: Array<{
    id: string;
    name: string;
    phone?: string | null;
    role?: string | null;
    isPrimary?: boolean;
    isActive?: boolean;
  }>;
  ratingHistory?: Array<{
    id: string;
    rating: number;
    note?: string | null;
    createdAt?: string | Date | null;
    createdById?: string | null;
  }>;
  purchaseOrderCount: number;
  batchCount: number;
  lastPurchaseOrderAt?: string | Date | null;
  lastBatchUpdatedAt?: string | Date | null;
  lastMasterDataUpdatedAt?: string | Date | null;
};

export * from "./construction-worker";

export type WarrantySummary = {
  id: string;
  storeId: string;
  orderId: string;
  order?: BusinessOrderSummary | null;
  warrantyNo: string;
  status: WarrantyStatus;
  scope: string;
  startDate: string;
  endDate: string;
  events?: WarrantyAuditEvent[];
  afterSales?: Array<{
    id: string;
    status?: string | null;
    description?: string | null;
    createdAt?: string | Date | null;
  }>;
};

export type WarrantyAuditEvent = {
  id: string;
  action: string;
  actorId?: string | null;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
};

export type AfterSaleSummary = {
  id: string;
  storeId: string;
  orderId: string;
  order?: BusinessOrderSummary | null;
  warrantyId: string | null;
  warranty?: {
    warrantyNo?: string | null;
    status?: string | null;
    scope?: string | null;
  } | null;
  customerId: string;
  description: string;
  status: AfterSaleStatus;
  responsibility: AfterSaleResponsibility;
  evidenceNote?: string | null;
  events?: AfterSaleAuditEvent[];
  capabilities?: {
    canAssign: boolean;
    canSubmitEvidence: boolean;
    canJudgeResponsibility: boolean;
    canClose: boolean;
  };
  issuePhotoUrls?: string[];
  constructionPhotoUrls?: string[];
  photos?: Array<{
    id: string;
    stage: AfterSalePhotoStage;
    url: string;
    note?: string | null;
    uploadedById?: string | null;
    createdAt?: string | Date | null;
    uploadedBy?: {
      id?: string;
      username?: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    } | null;
  }>;
  constructionIssueCategory?: string | null;
  resolutionNote?: string | null;
  assignments?: Array<{
    id?: string;
    workerUserId?: string;
    assignedAt?: string | Date | null;
    worker?: {
      id?: string;
      username?: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    } | null;
  }>;
  penalties?: Array<{
    id?: string;
    workerUserId?: string;
    amountCents?: number | null;
    reason?: string | null;
    createdAt?: string | Date | null;
    worker?: {
      id?: string;
      username?: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    } | null;
    createdBy?: {
      id?: string;
      username?: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    } | null;
  }>;
  costEntries?: Array<{
    id?: string;
    category?: "MATERIAL" | "CONSTRUCTION_LABOR" | "REFUND_COMPENSATION" | "OUTSOURCE" | "SUPPLIER_RECOVERY";
    direction?: "EXPENSE" | "RECOVERY";
    amountCents?: number | null;
    reason?: string | null;
    paymentRecordId?: string | null;
    status?: "CONFIRMED" | "REVERSED";
    reversalOfId?: string | null;
    reversalReason?: string | null;
    confirmedAt?: string | Date | null;
    reversedAt?: string | Date | null;
    recordedBy?: {
      id?: string;
      username?: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    } | null;
    reversedBy?: {
      id?: string;
      username?: string | null;
      nickname?: string | null;
      avatarUrl?: string | null;
    } | null;
  }>;
  closedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type AfterSaleAuditEvent = {
  id: string;
  action: string;
  actorId?: string | null;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string | Date | null;
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
  applicationNo?: string;
  storeId: string;
  title: string;
  amountCents: number;
  reason: string;
  status: FinanceApprovalStatus;
  currentNode?: FinanceApprovalNode | null;
  submittedAt?: string | Date | null;
  allowedActions?: FinanceAllowedAction[];
};

export type InvoiceSummary = {
  id: string;
  storeId: string;
  orderId: string;
  order?: BusinessOrderSummary | null;
  title: string;
  taxNo?: string | null;
  amountCents: number;
  status: InvoiceStatus;
  invoiceNo: string | null;
  fileUrl: string | null;
  createdAt?: string | Date | null;
};

export type RebateSummary = {
  id: string;
  storeId: string;
  orderId: string;
  order?: BusinessOrderSummary | null;
  amountCents: number;
  reason: string;
  status: RebateStatus;
};

export type BusinessOrderSummary = {
  orderNo?: string | null;
  status?: string | null;
  amount?: {
    paidAmountCents?: number | null;
    outstandingCents?: number | null;
  } | null;
  customer?: {
    name?: string | null;
    personalName?: string | null;
    companyName?: string | null;
    contactPerson?: string | null;
  } | null;
  vehicle?: {
    plateNo?: string | null;
    carPlate?: string | null;
    model?: string | null;
    carModel?: string | null;
    color?: string | null;
    carColor?: string | null;
  } | null;
  constructionRecord?: {
    id?: string;
    photos?: Array<{
      id: string;
      stage: "BEFORE" | "DURING" | "AFTER";
      url: string;
      uploadedById?: string | null;
      createdAt?: string | Date | null;
      uploadedBy?: {
        id?: string;
        username?: string | null;
        nickname?: string | null;
        avatarUrl?: string | null;
      } | null;
    }>;
  } | null;
};

export type ReportSummary = {
  orders: number;
  totalAmountCents: number;
  paidAmountCents: number;
  constructionRecords: number;
  afterSales: number;
  invoices: number;
  rebates: number;
  inventoryBatches: number;
  inventoryMovements: number;
  expenseAmountCents: number;
  reimbursementAmountCents: number;
  paymentRecordAmountCents: number;
  salesCommissionAmountCents: number;
  workerCommissionAmountCents: number;
  salesTrend: Array<{
    month: string;
    orders: number;
    totalAmountCents: number;
    paidAmountCents: number;
  }>;
  constructionTrend: Array<{
    month: string;
    records: number;
    completed: number;
    qualityPassed: number;
    reworkRequired: number;
  }>;
  afterSaleTrend: Array<{
    month: string;
    cases: number;
    resolved: number;
    constructionResponsibility: number;
  }>;
  commissionTrend: Array<{
    month: string;
    salesLogs: number;
    workerCommissions: number;
    salesCommissionCents: number;
    workerCommissionCents: number;
    workerAdjustmentCents: number;
    totalCommissionCents: number;
  }>;
  financeTrend: Array<{
    month: string;
    incomeCents: number;
    expenseCents: number;
    reimbursementCents: number;
    rebateCents: number;
    netCashflowCents: number;
  }>;
  inventoryTrend: Array<{
    month: string;
    movements: number;
    inboundQuantity: number;
    outboundQuantity: number;
    lockedQuantity: number;
    releasedQuantity: number;
    adjustmentQuantity: number;
  }>;
  invoiceTrend: Array<{
    month: string;
    invoices: number;
    issued: number;
    voided: number;
    reissued: number;
    amountCents: number;
  }>;
  rebateTrend: Array<{
    month: string;
    rebates: number;
    approved: number;
    paid: number;
    rejected: number;
    amountCents: number;
  }>;
};

/** Real people and order-level data used by the operational report centre. */
export type OperationalReportFilters = {
  storeId?: string;
  dateFrom?: string;
  dateTo?: string;
  dateBasis?: "DEFAULT" | "ORDER" | "APPOINTMENT" | "CONSTRUCTION_COMPLETED" | "SETTLEMENT";
  salesPersonId?: string;
  workerUserId?: string;
  constructionType?: string;
  productCategory?: string;
  orderStatus?: string;
};

export type OperationalReport = {
  dateBasis: NonNullable<OperationalReportFilters["dateBasis"]>;
  salesPeople: Array<{
    userId: string;
    name: string;
    orders: number;
    amountCents: number;
    receivedCents: number;
    costCents: number;
    grossProfitCents: number;
    accruedCommissionCents: number;
    confirmedCommissionCents: number;
    settledCommissionCents: number;
    costSourceActualOrders: number;
    costSourceStandardOrders: number;
    costSourceMissingOrders: number;
  }>;
  constructionWorkers: Array<{
    userId: string;
    name: string;
    orders: number;
    orderAmountCents: number;
    constructionChargeCents: number;
    allocatedConstructionChargeCents: number;
    confirmedMinutes: number;
    accruedCommissionCents: number;
    confirmedCommissionCents: number;
    settledCommissionCents: number;
    allocationStatus: "已按确认工时分摊" | "店长手工分摊" | "待确认工时";
  }>;
  financeOrders: Array<{
    orderId: string;
    orderNo: string;
    salesPersonName: string;
    constructionType: string;
    status: string;
    amountCents: number;
    receivedCents: number;
    materialCostCents: number;
    constructionCostCents: number;
    totalCostCents: number | null;
    grossProfitCents: number | null;
    costSource: "实际" | "标准" | "待补齐";
  }>;
  projectStats: Array<{
    dimension: "施工类型" | "产品分类";
    name: string;
    orders: number;
    amountCents: number;
    constructionChargeCents: number;
  }>;
  afterSaleWorkers: Array<{
    userId: string;
    name: string;
    afterSales: number;
    constructionOrders: number;
    afterSaleRateBps: number;
    materialCostCents: number;
    laborCostCents: number;
    refundCompensationCents: number;
    outsourceCostCents: number;
    supplierRecoveryCents: number;
  }>;
  afterSaleBreakdown: Array<{ category: string; afterSales: number; proportionBps: number }>;
};

export type OperationalReportFilterOptions = {
  salesPeople: Array<{ id: string; name: string; position: StorePosition }>;
  constructionPeople: Array<{ id: string; name: string; position: StorePosition }>;
  constructionTypes: string[];
  productCategories: string[];
  orderStatuses: string[];
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
  // 登录、刷新和 /auth/me 均返回当前默认门店身份；无门店身份时为 null
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
