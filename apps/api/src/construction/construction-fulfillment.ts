import { ForbiddenException, Injectable } from "@nestjs/common";
import { ConstructionService, type AuthenticatedConstructionUser } from "./construction.service";
import { CrossStoreConstructionService } from "./cross-store-construction.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccessContext } from "../permissions/domain/access-context";
import { OrderLifecycle } from "../orders/domain/order-lifecycle";
import { type OrderWorkflow } from "../orders/domain/order-workflow";
import type {
  AssignOrderDto, CompleteConstructionDto, ListConstructionDto,
  QualityCheckDto, StartConstructionDto
} from "./dto/construction.dto";
import type {
  CancelCrossStoreTaskDto,
  CompleteCrossStoreAcceptanceDto,
  ListCrossStoreTasksDto,
  RejectCrossStoreTaskDto
} from "./dto/cross-store-construction.dto";

export type FulfillmentView = {
  order: {
    id: string;
    orderNo: string;
    storeId: string;
    executionStoreId: string;
    status: string;
    lifecycleVersion: number;
    appointmentDate: string | null;
    appointmentTimeSlot: string | null;
    constructionLocation: string | null;
    outsideAddress: string | null;
    constructionType: string;
    customer: { name: string | null; companyName: string | null; contactPerson: string | null } | null;
    vehicle: { carPlate: string | null; carModel: string | null; carColor: string | null } | null;
  };
  construction: {
    id: string;
    status: string;
    startedAt: string | null;
    completedAt: string | null;
    actualMinutes: number | null;
    overtimeMinutes: number | null;
    qualityResult: string | null;
    qualityNote: string | null;
    qualityCheckedAt: string | null;
    photos: Array<{ id: string; stage: string; url: string; uploadedById: string }>;
    assignments: Array<{ workerUserId: string }>;
  } | null;
  workflow: OrderWorkflow;
  lifecycle: {
    orderId: string;
    lifecycleVersion: number;
    currentStage: string;
    blockingReasonCodes: string[];
    capabilities: Record<string, { visible: boolean; enabled: boolean; blockingReasonCodes: string[] }>;
    [key: string]: unknown;
  };
  generatedAt: string;
};

export type FulfillmentStepCommand =
  | { type: "DISPATCH"; input: AssignOrderDto }
  | { type: "START_CONSTRUCTION"; input: StartConstructionDto }
  | { type: "COMPLETE_CONSTRUCTION"; input: CompleteConstructionDto }
  | { type: "QUALITY_CHECK"; recordId: string; input: QualityCheckDto };

export type FulfillmentListItem = {
  id: string;
  orderId: string;
  orderNo: string;
  storeId: string;
  executionStoreId: string;
  status: string;
  lifecycleVersion: number;
  constructionStatus: string;
  appointmentDate: string | null;
  appointmentTimeSlot: string | null;
  constructionLocation: string | null;
  customer: { name: string | null; companyName: string | null } | null;
  vehicle: { carPlate: string | null; carModel: string | null; carColor: string | null } | null;
  assignments: Array<{ workerUserId: string }>;
  photoCount: number;
  workflow: OrderWorkflow;
  lifecycle?: FulfillmentView["lifecycle"];
  lifecycleError?: { code: string };
};

export type FulfillmentList = {
  items: FulfillmentListItem[];
  generatedAt: string;
};

/** Public boundary for the order fulfilment lifecycle and cross-store acceptance. */
@Injectable()
export class ConstructionFulfillment {
  constructor(
    private readonly construction: ConstructionService,
    private readonly crossStore: CrossStoreConstructionService,
    private readonly orderLifecycle: OrderLifecycle,
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext
  ) {}

  async getFulfillmentView(user: AuthenticatedConstructionUser, orderId: string): Promise<FulfillmentView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        storeId: true,
        executionStoreId: true,
        status: true,
        lifecycleVersion: true,
        appointmentDate: true,
        appointmentTimeSlot: true,
        constructionLocation: true,
        constructionAddress: true,
        constructionType: true,
        customer: { select: { name: true, companyName: true, contactPerson: true } },
        vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
        amount: { select: { paidAmountCents: true, outstandingCents: true } },
        inventoryAllocations: { select: { status: true, outboundQuantity: true } },
        constructionRecord: {
          select: {
            id: true,
            status: true,
            startedAt: true,
            completedAt: true,
            actualMinutes: true,
            overtimeMinutes: true,
            qualityResult: true,
            qualityNote: true,
            qualityCheckedAt: true,
            photos: { select: { id: true, stage: true, url: true, uploadedById: true } },
            assignments: { select: { workerUserId: true } }
          }
        },
        warranty: { select: { status: true } }
      }
    });
    if (!order) throw new ForbiddenException("订单不存在或无权访问");
    const executionStoreId = order.executionStoreId ?? order.storeId;
    const allowed = await this.accessContext.can(user.id, "construction", "read", { storeId: executionStoreId }) ||
      await this.accessContext.can(user.id, "construction", "read", { storeId: order.storeId });
    if (!allowed) throw new ForbiddenException("无权限");
    const input = {
      status: order.status,
      amount: order.amount,
      constructionRecord: order.constructionRecord,
      inventoryAllocations: order.inventoryAllocations,
      warranty: order.warranty,
      historicalQualityMissing: (["COMPLETED", "WARRANTIED"] as string[]).includes(order.status) && !order.constructionRecord?.qualityResult
    };
    const workflow = this.orderLifecycle.getLifecycle(input);
    const lifecycle = await this.orderLifecycle.getAuthoritativeLifecycle(user, orderId);
    return {
      order: {
        id: order.id,
        orderNo: order.orderNo,
        storeId: order.storeId,
        executionStoreId,
        status: order.status,
        lifecycleVersion: order.lifecycleVersion,
        appointmentDate: order.appointmentDate?.toISOString() ?? null,
        appointmentTimeSlot: order.appointmentTimeSlot,
        constructionLocation: order.constructionLocation,
        outsideAddress: order.constructionAddress,
        constructionType: order.constructionType,
        customer: order.customer,
        vehicle: order.vehicle
      },
      construction: order.constructionRecord
        ? {
          ...order.constructionRecord,
          startedAt: order.constructionRecord.startedAt?.toISOString() ?? null,
          completedAt: order.constructionRecord.completedAt?.toISOString() ?? null,
          qualityCheckedAt: order.constructionRecord.qualityCheckedAt?.toISOString() ?? null
        }
        : null,
      workflow,
      lifecycle,
      generatedAt: new Date().toISOString()
    };
  }

  async getCapabilities(user: AuthenticatedConstructionUser, orderId: string) {
    const view = await this.getFulfillmentView(user, orderId);
    return { orderId, ...view.lifecycle.capabilities, currentStage: view.lifecycle.currentStage, blockingReasonCodes: view.lifecycle.blockingReasonCodes, generatedAt: view.generatedAt };
  }

  async listFulfillments(user: AuthenticatedConstructionUser, query: ListConstructionDto): Promise<FulfillmentList> {
    const records = await this.construction.listAssignments(user, query);
    const orderFacts = this.prisma && records.length > 0
      ? await this.prisma.order.findMany({
        where: { id: { in: records.map((record) => record.orderId) } },
        select: {
          id: true,
          orderNo: true,
          storeId: true,
          executionStoreId: true,
          status: true,
          lifecycleVersion: true,
          appointmentDate: true,
          appointmentTimeSlot: true,
          constructionLocation: true,
          constructionAddress: true,
          customer: { select: { name: true, companyName: true } },
          vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
          amount: { select: { paidAmountCents: true, outstandingCents: true } },
          inventoryAllocations: { select: { status: true, outboundQuantity: true } },
          warranty: { select: { status: true } }
        }
      })
      : [];
    const orderFactById = new Map(orderFacts.map((order) => [order.id, order]));
    const lifecycleByOrder = await this.orderLifecycle.listAuthoritativeLifecycle(user, records.map((record) => record.orderId));
    const items = records.map((record) => {
      const orderFact = orderFactById.get(record.orderId);
      const order = orderFact ?? record.order;
      const amount = orderFact?.amount ?? ("amount" in order ? order.amount : null);
      const inventoryAllocations = orderFact?.inventoryAllocations ?? ("inventoryAllocations" in order ? order.inventoryAllocations : []);
      const warranty = orderFact?.warranty ?? ("warranty" in order ? order.warranty : null);
      const executionStoreId = order.executionStoreId ?? record.storeId;
      const workflowInput = {
        status: order.status,
        lifecycleVersion: order.lifecycleVersion,
        amount,
        constructionRecord: record,
        inventoryAllocations,
        warranty,
        historicalQualityMissing: (["COMPLETED", "WARRANTIED"] as string[]).includes(order.status) && !record.qualityResult
      };
      const workflow = this.orderLifecycle.getLifecycle(workflowInput);
      const lifecycleEntry = lifecycleByOrder[record.orderId];
      return {
        id: record.id,
        orderId: record.orderId,
        orderNo: order.orderNo,
        storeId: order.storeId,
        executionStoreId,
        status: order.status,
        lifecycleVersion: order.lifecycleVersion,
        constructionStatus: record.status,
        appointmentDate: order.appointmentDate?.toISOString() ?? null,
        appointmentTimeSlot: order.appointmentTimeSlot,
        constructionLocation: order.constructionLocation,
        customer: order.customer ? { name: order.customer.name, companyName: order.customer.companyName } : null,
        vehicle: order.vehicle ? { carPlate: order.vehicle.carPlate, carModel: order.vehicle.carModel, carColor: order.vehicle.carColor } : null,
        assignments: record.assignments.map((assignment) => ({ workerUserId: assignment.workerUserId })),
        photoCount: record.photos.length,
        workflow,
        ...(lifecycleEntry?.ok
          ? { lifecycle: lifecycleEntry.value }
          : { lifecycleError: lifecycleEntry?.error ?? { code: "LIFECYCLE_UNAVAILABLE" } })
      };
    });
    return { items, generatedAt: new Date().toISOString() };
  }

  assign(user: AuthenticatedConstructionUser, orderId: string, input: AssignOrderDto, context: { commandId: string; expectedVersion: number }) { return this.construction.assignOrder(user, orderId, input, context); }
  start(user: AuthenticatedConstructionUser, orderId: string, input: StartConstructionDto, context: { commandId: string; expectedVersion: number }) { return this.construction.startOrder(user, orderId, input, context); }
  complete(user: AuthenticatedConstructionUser, orderId: string, input: CompleteConstructionDto, context: { commandId: string; expectedVersion: number }) { return this.construction.completeOrderForOrder(user, orderId, input, context); }
  qualityCheck(user: AuthenticatedConstructionUser, recordId: string, input: QualityCheckDto, context: { commandId: string; expectedVersion: number }) { return this.construction.qualityCheck(user, recordId, input, context); }

  async listCrossStoreTasks(user: AuthenticatedConstructionUser, query: ListCrossStoreTasksDto) {
    const tasks = await this.crossStore.list(user, query);
    const lifecycleByOrder = await this.orderLifecycle.listAuthoritativeLifecycle(user, tasks.map((task) => task.orderId));
    return Promise.all(tasks.map(async (task) => {
      const [canExecute, canSource] = await Promise.all([
        this.accessContext.can(user.id, "construction", "write", { storeId: task.executionStoreId }),
        this.accessContext.can(user.id, "orders.lifecycle", "cross_store_source_manage", { storeId: task.sourceStoreId })
      ]);
      const base = lifecycleByOrder[task.orderId]?.ok ? lifecycleByOrder[task.orderId].value : undefined;
      const capability = (visible: boolean, enabled: boolean, blockingReasonCodes: string[] = []) => ({ visible, enabled: visible && enabled, blockingReasonCodes: visible && enabled ? [] : blockingReasonCodes });
      const executionState = {
        acceptCrossStore: capability(canExecute && query.scope === "EXECUTION", task.status === "PENDING_ACCEPTANCE", ["TASK_NOT_PENDING_ACCEPTANCE"]),
        rejectCrossStore: capability(canExecute && query.scope === "EXECUTION", task.status === "PENDING_ACCEPTANCE", ["TASK_NOT_PENDING_ACCEPTANCE"]),
        submitCrossStoreAcceptance: capability(canExecute && query.scope === "EXECUTION", ["DISPATCHED", "IN_CONSTRUCTION"].includes(task.status), ["TASK_NOT_READY_FOR_ACCEPTANCE"]),
        cancelCrossStore: capability(canSource && query.scope === "SOURCE", !["COMPLETED", "CANCELLED", "IN_CONSTRUCTION", "PENDING_SOURCE_ACCEPTANCE"].includes(task.status), ["TASK_NOT_CANCELLABLE"]),
        acceptCrossStoreBySource: capability(canSource && query.scope === "SOURCE", task.status === "PENDING_SOURCE_ACCEPTANCE", ["TASK_NOT_PENDING_SOURCE_ACCEPTANCE"])
      };
      return { ...task, lifecycle: base ? { ...base, capabilities: { ...base.capabilities, ...executionState } } : { capabilities: executionState } };
    }));
  }
  async acceptCrossStoreTask(user: AuthenticatedConstructionUser, id: string, context: { commandId: string; expectedVersion: number; taskVersion: number }) {
    const task = await this.crossStore.get(user, id);
    return this.orderLifecycle.transition(user, task.orderId, { type: "ACCEPT_CROSS_STORE_TASK", taskId: id, taskVersion: context.taskVersion }, { ...context, source: "CONSTRUCTION_WEB" });
  }
  async rejectCrossStoreTask(user: AuthenticatedConstructionUser, id: string, input: RejectCrossStoreTaskDto, context: { commandId: string; expectedVersion: number; taskVersion: number }) {
    const task = await this.crossStore.get(user, id);
    return this.orderLifecycle.transition(user, task.orderId, { type: "REJECT_CROSS_STORE_TASK", taskId: id, taskVersion: context.taskVersion, input }, { ...context, source: "CONSTRUCTION_WEB" });
  }
  async cancelCrossStoreTask(user: AuthenticatedConstructionUser, id: string, input: CancelCrossStoreTaskDto, context: { commandId: string; expectedVersion: number; taskVersion: number }) {
    const task = await this.crossStore.get(user, id);
    return this.orderLifecycle.transition(user, task.orderId, { type: "CANCEL_CROSS_STORE_TASK", taskId: id, taskVersion: context.taskVersion, input }, { ...context, source: "CONSTRUCTION_WEB" });
  }
  async submitCrossStoreAcceptance(user: AuthenticatedConstructionUser, id: string, input: CompleteCrossStoreAcceptanceDto, context: { commandId: string; expectedVersion: number; taskVersion: number }) {
    const task = await this.crossStore.get(user, id);
    return this.orderLifecycle.transition(user, task.orderId, { type: "SUBMIT_CROSS_STORE_ACCEPTANCE", taskId: id, taskVersion: context.taskVersion, input }, { ...context, source: "CONSTRUCTION_WEB" });
  }
  async acceptCrossStoreBySource(user: AuthenticatedConstructionUser, id: string, context: { commandId: string; expectedVersion: number; taskVersion: number }) {
    const task = await this.crossStore.get(user, id);
    return this.orderLifecycle.transition(user, task.orderId, { type: "ACCEPT_CROSS_STORE_BY_SOURCE", taskId: id, taskVersion: context.taskVersion }, { ...context, source: "CONSTRUCTION_WEB" });
  }
}
