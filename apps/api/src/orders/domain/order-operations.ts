import type { AuthenticatedOrderUser } from "../orders.service";
import type { CreateOrderDto } from "../dto/create-order.dto";
import type { CopyOrderToDraftDto } from "../dto/copy-order.dto";
import type { CreateOrderAmendmentRequestDto, ReviewOrderAmendmentRequestDto } from "../dto/order-amendment.dto";
import type { CreateOrderPaymentDto } from "../dto/create-order-payment.dto";
import type { CreatePaymentAccountDto } from "../dto/create-payment-account.dto";
import type { UpdatePaymentAccountDto } from "../dto/update-payment-account.dto";
import type { ExportOrderDetailsDto, ListOrdersDto } from "../dto/list-orders.dto";
import type { ReturnOrderDto } from "../dto/return-order.dto";
import type { UpdateOrderCommercialsDto } from "../dto/update-order-commercials.dto";

export const ORDER_OPERATIONS = Symbol("ORDER_OPERATIONS");
export const ORDER_READ_MODEL = Symbol("ORDER_READ_MODEL");

/** Read seam for stable order-operation projections and scope semantics. */
export interface OrderReadModel {
  list(user: AuthenticatedOrderUser, dto: ListOrdersDto): Promise<unknown>;
  exportDetails(user: AuthenticatedOrderUser, dto: ExportOrderDetailsDto): Promise<unknown>;
  detail(user: AuthenticatedOrderUser, id: string): Promise<unknown>;
  listPayments(user: AuthenticatedOrderUser, orderId: string): Promise<unknown>;
  listAuditEvents(user: AuthenticatedOrderUser, orderId: string): Promise<unknown>;
  listPaymentAccounts(user: AuthenticatedOrderUser, storeId: string): Promise<unknown>;
  listPaymentAccountAuditEvents(user: AuthenticatedOrderUser, id: string): Promise<unknown>;
  lifecycle(user: AuthenticatedOrderUser, orderId: string): Promise<unknown>;
  lifecycleBatch(user: AuthenticatedOrderUser, orderIds: string[]): Promise<unknown>;
  listHistoricalVerification(user: AuthenticatedOrderUser, storeId: string, q?: string): Promise<unknown>;
}

/** Command seam for order administration; lifecycle authority remains OrderLifecycle internally. */
export interface OrderOperations {
  create(user: AuthenticatedOrderUser, commandId: string | undefined, dto: CreateOrderDto): Promise<unknown>;
  copyToDraft(user: AuthenticatedOrderUser, id: string, dto: CopyOrderToDraftDto): Promise<unknown>;
  addPayment(user: AuthenticatedOrderUser, orderId: string, dto: CreateOrderPaymentDto): Promise<unknown>;
  finalizeDelivery(user: AuthenticatedOrderUser, orderId: string, context: { commandId?: string; expectedVersion?: string }): Promise<unknown>;
  updateCommercials(user: AuthenticatedOrderUser, orderId: string, dto: UpdateOrderCommercialsDto): Promise<unknown>;
  createAmendmentRequest(user: AuthenticatedOrderUser, orderId: string, dto: CreateOrderAmendmentRequestDto): Promise<unknown>;
  reviewAmendmentRequest(user: AuthenticatedOrderUser, orderId: string, requestId: string, dto: ReviewOrderAmendmentRequestDto): Promise<unknown>;
  cancelOrder(user: AuthenticatedOrderUser, orderId: string, dto: ReturnOrderDto, context: { commandId?: string; expectedVersion?: string }): Promise<unknown>;
  returnToPendingDispatch(user: AuthenticatedOrderUser, orderId: string, dto: ReturnOrderDto, context: { commandId?: string; expectedVersion?: string }): Promise<unknown>;
  markHistoricalVerified(user: AuthenticatedOrderUser, orderId: string, dto: { summary: string; factRefs: string[] }, context: { commandId?: string; expectedVersion?: string }): Promise<unknown>;
  createPaymentAccount(user: AuthenticatedOrderUser, dto: CreatePaymentAccountDto): Promise<unknown>;
  updatePaymentAccount(user: AuthenticatedOrderUser, id: string, dto: UpdatePaymentAccountDto): Promise<unknown>;
  removePaymentAccount(user: AuthenticatedOrderUser, id: string): Promise<unknown>;
}
