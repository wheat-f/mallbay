import { ForbiddenException, Injectable, Optional } from "@nestjs/common";
import { ConstructionService, type AuthenticatedConstructionUser } from "./construction.service";
import { CrossStoreConstructionService } from "./cross-store-construction.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccessContext } from "../permissions/domain/access-context";
import { OrderLifecycle } from "../orders/domain/order-lifecycle";
import { deriveOrderWorkflow, type OrderWorkflow } from "../orders/domain/order-workflow";
import type {
  AssignOrderDto, CompleteConstructionDto, ListConstructionDto, OfflineSyncDto,
  QualityCheckDto, StartConstructionDto, UploadConstructionPhotoDto,
  VerifyMaterialBatchDto, PickupConstructionMaterialDto, RecordMaterialLossDto
} from "./dto/construction.dto";
import type {
  CancelCrossStoreTaskDto,
  CompleteCrossStoreAcceptanceDto,
  ListCrossStoreTasksDto,
  RejectCrossStoreTaskDto
} from "./dto/cross-store-construction.dto";
import type { MulterFile } from "../users/multer-file.type";

export type FulfillmentView = {
  order: {
    id: string;
    orderNo: string;
    storeId: string;
    executionStoreId: string;
    status: string;
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
  constructionStatus: string;
  appointmentDate: string | null;
  appointmentTimeSlot: string | null;
  constructionLocation: string | null;
  customer: { name: string | null; companyName: string | null } | null;
  vehicle: { carPlate: string | null; carModel: string | null; carColor: string | null } | null;
  assignments: Array<{ workerUserId: string }>;
  photoCount: number;
  workflow: OrderWorkflow;
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
    @Optional() private readonly prisma?: PrismaService,
    @Optional() private readonly orderLifecycle?: OrderLifecycle,
    @Optional() private readonly accessContext?: AccessContext
  ) {}

  async getFulfillmentView(user: AuthenticatedConstructionUser, orderId: string): Promise<FulfillmentView> {
    if (!this.prisma) throw new Error("ConstructionFulfillment read implementation is not configured");
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNo: true,
        storeId: true,
        executionStoreId: true,
        status: true,
        appointmentDate: true,
        appointmentTimeSlot: true,
        constructionLocation: true,
        outsideAddress: true,
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
    if (!this.accessContext) throw new Error("ConstructionFulfillment access implementation is not configured");
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
    const workflow = this.orderLifecycle?.getLifecycle(input) ?? deriveOrderWorkflow(input);
    return {
      order: {
        id: order.id,
        orderNo: order.orderNo,
        storeId: order.storeId,
        executionStoreId,
        status: order.status,
        appointmentDate: order.appointmentDate?.toISOString() ?? null,
        appointmentTimeSlot: order.appointmentTimeSlot,
        constructionLocation: order.constructionLocation,
        outsideAddress: order.outsideAddress,
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
      generatedAt: new Date().toISOString()
    };
  }

  async getCapabilities(user: AuthenticatedConstructionUser, orderId: string) {
    const view = await this.getFulfillmentView(user, orderId);
    return { orderId, ...view.workflow.capabilities, currentStage: view.workflow.currentStage, blockingReasons: view.workflow.blockingReasons, generatedAt: view.generatedAt };
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
          appointmentDate: true,
          appointmentTimeSlot: true,
          constructionLocation: true,
          outsideAddress: true,
          customer: { select: { name: true, companyName: true } },
          vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
          amount: { select: { paidAmountCents: true, outstandingCents: true } },
          inventoryAllocations: { select: { status: true, outboundQuantity: true } },
          warranty: { select: { status: true } }
        }
      })
      : [];
    const orderFactById = new Map(orderFacts.map((order) => [order.id, order]));
    const items = records.map((record) => {
      const orderFact = orderFactById.get(record.orderId);
      const order = orderFact ?? record.order;
      const amount = orderFact?.amount ?? ("amount" in order ? order.amount : null);
      const inventoryAllocations = orderFact?.inventoryAllocations ?? ("inventoryAllocations" in order ? order.inventoryAllocations : []);
      const warranty = orderFact?.warranty ?? ("warranty" in order ? order.warranty : null);
      const executionStoreId = order.executionStoreId ?? record.storeId;
      const workflowInput = {
        status: order.status,
        amount,
        constructionRecord: record,
        inventoryAllocations,
        warranty,
        historicalQualityMissing: (["COMPLETED", "WARRANTIED"] as string[]).includes(order.status) && !record.qualityResult
      };
      const workflow = this.orderLifecycle?.getLifecycle(workflowInput) ?? deriveOrderWorkflow(workflowInput);
      return {
        id: record.id,
        orderId: record.orderId,
        orderNo: order.orderNo,
        storeId: order.storeId,
        executionStoreId,
        status: order.status,
        constructionStatus: record.status,
        appointmentDate: order.appointmentDate?.toISOString() ?? null,
        appointmentTimeSlot: order.appointmentTimeSlot,
        constructionLocation: order.constructionLocation,
        customer: order.customer ? { name: order.customer.name, companyName: order.customer.companyName } : null,
        vehicle: order.vehicle ? { carPlate: order.vehicle.carPlate, carModel: order.vehicle.carModel, carColor: order.vehicle.carColor } : null,
        assignments: record.assignments.map((assignment) => ({ workerUserId: assignment.workerUserId })),
        photoCount: record.photos.length,
        workflow
      };
    });
    return { items, generatedAt: new Date().toISOString() };
  }

  executeStep(user: AuthenticatedConstructionUser, orderId: string, command: FulfillmentStepCommand) {
    if (command.type === "DISPATCH") return this.assign(user, orderId, command.input);
    if (command.type === "START_CONSTRUCTION") return this.start(user, orderId, command.input);
    if (command.type === "COMPLETE_CONSTRUCTION") return this.complete(user, orderId, command.input);
    return this.qualityCheck(user, command.recordId, command.input);
  }

  listAssignments(user: AuthenticatedConstructionUser, query: ListConstructionDto) { return this.construction.listAssignments(user, query); }
  assign(user: AuthenticatedConstructionUser, orderId: string, input: AssignOrderDto) { return this.construction.assignOrder(user, orderId, input); }
  start(user: AuthenticatedConstructionUser, orderId: string, input: StartConstructionDto) { return this.construction.startOrder(user, orderId, input); }
  complete(user: AuthenticatedConstructionUser, orderId: string, input: CompleteConstructionDto) { return this.construction.completeOrderForOrder(user, orderId, input); }
  uploadEvidence(user: AuthenticatedConstructionUser, recordId: string, input: UploadConstructionPhotoDto, file?: MulterFile) {
    return this.construction.uploadPhoto(user, recordId, input, file);
  }
  recordEvidence(user: AuthenticatedConstructionUser, recordId: string, input: UploadConstructionPhotoDto, file?: MulterFile) {
    return this.uploadEvidence(user, recordId, input, file);
  }
  qualityCheck(user: AuthenticatedConstructionUser, recordId: string, input: QualityCheckDto) { return this.construction.qualityCheck(user, recordId, input); }
  qualityHistory(user: AuthenticatedConstructionUser, recordId: string) { return this.construction.listQualityHistory(user, recordId); }
  getMaterials(user: AuthenticatedConstructionUser, orderId: string) { return this.construction.getOrderMaterials(user, orderId); }
  verifyMaterialBatch(user: AuthenticatedConstructionUser, orderId: string, input: VerifyMaterialBatchDto) { return this.construction.verifyMaterialBatch(user, orderId, input); }
  pickupMaterials(user: AuthenticatedConstructionUser, orderId: string, input: PickupConstructionMaterialDto) { return this.construction.pickupMaterials(user, orderId, input); }
  recordMaterialLoss(user: AuthenticatedConstructionUser, orderId: string, input: RecordMaterialLossDto) { return this.construction.recordMaterialLoss(user, orderId, input); }
  syncOfflineOperations(user: AuthenticatedConstructionUser, input: OfflineSyncDto) { return this.construction.syncOfflineOperations(user, input); }
  syncOffline(user: AuthenticatedConstructionUser, input: OfflineSyncDto) { return this.syncOfflineOperations(user, input); }

  listCrossStoreTasks(user: AuthenticatedConstructionUser, query: ListCrossStoreTasksDto) { return this.crossStore.list(user, query); }
  acceptCrossStoreTask(user: AuthenticatedConstructionUser, id: string) { return this.crossStore.accept(user, id); }
  rejectCrossStoreTask(user: AuthenticatedConstructionUser, id: string, input: RejectCrossStoreTaskDto) { return this.crossStore.reject(user, id, input); }
  cancelCrossStoreTask(user: AuthenticatedConstructionUser, id: string, input: CancelCrossStoreTaskDto) { return this.crossStore.cancel(user, id, input); }
  submitCrossStoreAcceptance(user: AuthenticatedConstructionUser, id: string, input: CompleteCrossStoreAcceptanceDto) { return this.crossStore.submitForSourceAcceptance(user, id, input); }
  acceptCrossStoreBySource(user: AuthenticatedConstructionUser, id: string) { return this.crossStore.completeSourceAcceptance(user, id); }
}
