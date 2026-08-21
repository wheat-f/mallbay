import { BadRequestException, ConflictException, ForbiddenException, HttpException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { CapacityReservationStatus, ConstructionLocation, ConstructionType, InventoryMovementType, NotificationType, OrderLifecycleCommandStatus, OrderStatus, Prisma, SalesQuoteStatus } from "@prisma/client";
import { type UserWithStoreMember } from "../../permissions/domain/access-types";
import { PrismaService } from "../../prisma/prisma.service";
import { AccessContext } from "../../permissions/domain/access-context";
import { deriveOrderWorkflow, type OrderWorkflow } from "./order-workflow";
import { ensureBalanceTodos, finalizeOrderDelivery } from "./order-delivery";
import { CreateOrderUseCase } from "../use-cases/create-order.use-case";
import { type CreateOrderDto } from "../dto/create-order.dto";
import { ConstructionLifecycleImplementation } from "../implementation/construction-lifecycle.implementation";
import { OrderLifecycleObservability } from "./order-lifecycle-observability";
import {
  assertCommandBinding,
  fingerprintCommand,
  type OrderLifecycleCommandContext,
  replayStoredRejection,
  requireCommandId,
  requireExpectedVersion,
  type OrderLifecycleTransitionContext,
  toJsonValue
} from "./order-lifecycle-command";

export type OrderLifecycleCommand =
  | { type: "FINAL_DELIVERY" }
  | { type: "CANCEL"; reason: string }
  | { type: "RETURN_TO_PENDING_DISPATCH"; reason: string }
  | { type: "DISPATCH"; input: unknown }
  | { type: "START_CONSTRUCTION"; input: unknown }
  | { type: "COMPLETE_CONSTRUCTION"; input: unknown }
  | { type: "QUALITY_CHECK"; recordId: string; input: unknown }
  | { type: "RESOLVE_HISTORICAL_VERIFICATION"; input: { summary: string; factRefs: string[] } }
  | { type: "ACCEPT_CROSS_STORE_TASK"; taskId: string; taskVersion: number }
  | { type: "REJECT_CROSS_STORE_TASK"; taskId: string; taskVersion: number; input: { reason: string } }
  | { type: "CANCEL_CROSS_STORE_TASK"; taskId: string; taskVersion: number; input: { reason: string } }
  | { type: "SUBMIT_CROSS_STORE_ACCEPTANCE"; taskId: string; taskVersion: number; input: { remark: string } }
  | { type: "ACCEPT_CROSS_STORE_BY_SOURCE"; taskId: string; taskVersion: number };

export type CreateOrderCommandInput =
  | { source: "DIRECT"; order: CreateOrderDto }
  | { source: "APPROVED_QUOTE"; quoteId: string };

export type LifecycleActionCapability = {
  visible: boolean;
  enabled: boolean;
  blockingReasonCodes: string[];
};

/**
 * Required application seam for every order-lifecycle write and authoritative
 * workflow read.  Construction and order-creation services are internal
 * implementations; callers must not bypass this boundary.
 */
@Injectable()
export class OrderLifecycle {
  constructor(
    private readonly createOrderUseCase: CreateOrderUseCase,
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    private readonly constructionImplementation: ConstructionLifecycleImplementation,
    @Optional() private readonly observability?: OrderLifecycleObservability
  ) {}

  async createOrder(
    user: UserWithStoreMember,
    commandContext: OrderLifecycleCommandContext,
    input: CreateOrderCommandInput
  ) {
    const commandId = requireCommandId(commandContext.commandId);
    const startedAt = Date.now();
    const quoteHeader = input.source === "APPROVED_QUOTE"
      ? await this.prisma.salesQuote.findUnique({ where: { id: input.quoteId }, select: { id: true, storeId: true, executionStoreId: true, salesPersonId: true } })
      : null;
    if (input.source === "APPROVED_QUOTE" && !quoteHeader) throw new NotFoundException("报价单不存在");
    if (quoteHeader && !await this.accessContext.can({ userId: user.id }, "orders", "write", { storeId: quoteHeader.storeId, ownerId: quoteHeader.salesPersonId })) {
      throw new ForbiddenException("只有报价销售或店长可以转订单");
    }
    const storeId = input.source === "DIRECT" ? input.order.storeId : quoteHeader!.storeId;
    const commandType = input.source === "DIRECT" ? "CREATE_ORDER" : "CONVERT_QUOTE_TO_ORDER";
    const targetType = input.source === "DIRECT" ? "ORDER_CREATION" : "QUOTE";
    const targetId = input.source === "DIRECT" ? input.order.storeId : input.quoteId;
    const crossStore = input.source === "DIRECT"
      ? (input.order.executionStoreId ?? input.order.storeId) !== input.order.storeId
      : quoteHeader!.executionStoreId !== quoteHeader!.storeId;
    const binding = {
      actorId: user.id,
      commandType,
      targetType,
      targetId,
      requestFingerprint: fingerprintCommand(commandType, targetId, input)
    };
    const replay = await this.findCommand(storeId, commandId, binding);
    if (replay !== undefined) {
      this.observability?.record({
        commandType,
        source: commandContext.source,
        replayed: true,
        beforeVersion: 0,
        afterVersion: 1,
        resultCode: getLifecycleResultCode(replay),
        durationMs: Date.now() - startedAt,
        crossStore,
        rolledBack: false,
        notificationIntentCount: null
      });
      return replay;
    }

    let notificationIntentCount = 0;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const observedTx = withNotificationCounter(tx, (count) => { notificationIntentCount += count; });
        const commandRecord = await tx.orderLifecycleCommandRecord.create({
          data: {
            storeId,
            commandId,
            ...binding,
            status: OrderLifecycleCommandStatus.SUCCEEDED,
            inputSummary: {
              caller: commandContext.source,
              source: input.source,
              ...(input.source === "DIRECT"
                ? {
                  customerId: input.order.customerId,
                  vehicleId: input.order.vehicleId,
                  itemCount: input.order.items.length,
                  executionStoreId: input.order.executionStoreId ?? input.order.storeId
                }
                : { quoteId: input.quoteId })
            }
          }
        });
        try {
          const execution = input.source === "DIRECT"
            ? { payload: await this.createOrderUseCase.executeWithin(observedTx, user, input.order), applied: true }
            : await this.convertApprovedQuoteWithin(observedTx, user, input.quoteId);
          const orderId = "id" in execution.payload ? execution.payload.id : execution.payload.orderId;
          if (execution.applied) await tx.orderLifecycleVersionChange.create({
            data: { orderId, beforeVersion: 0, afterVersion: 1, sourceType: "COMMAND", sourceKey: commandRecord.id, sourceRefs: { commandId, commandType } }
          });
          const lifecycleVersion = execution.applied
            ? 1
            : (await tx.order.findUnique({ where: { id: orderId }, select: { lifecycleVersion: true } }))?.lifecycleVersion;
          await tx.orderLifecycleCommandRecord.update({
            where: { id: commandRecord.id },
            data: {
              orderId,
              beforeVersion: execution.applied ? 0 : lifecycleVersion,
              afterVersion: lifecycleVersion,
              resultSummary: toJsonValue(execution.payload) as Prisma.InputJsonValue,
              completedAt: new Date()
            }
          });
          return { payload: execution.payload };
        } catch (error) {
          if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
          const response = error.getResponse();
          const summary = typeof response === "string"
            ? { code: "COMMAND_PRECONDITION_FAILED", message: response, httpStatus: error.getStatus() }
            : { ...(response as object), httpStatus: error.getStatus() };
          await tx.orderLifecycleCommandRecord.update({
            where: { id: commandRecord.id },
            data: {
              status: OrderLifecycleCommandStatus.REJECTED,
              resultSummary: summary as Prisma.InputJsonValue,
              completedAt: new Date()
            }
          });
          return { rejected: summary };
        }
      });
      if ("rejected" in result) replayStoredRejection(result.rejected);
      this.observability?.record({
        commandType,
        source: commandContext.source,
        replayed: false,
        beforeVersion: 0,
        afterVersion: 1,
        resultCode: getLifecycleResultCode(result.payload),
        durationMs: Date.now() - startedAt,
        crossStore,
        rolledBack: false,
        notificationIntentCount
      });
      return result.payload;
    } catch (error) {
      this.observability?.record({
        commandType,
        source: commandContext.source,
        replayed: false,
        beforeVersion: 0,
        afterVersion: null,
        resultCode: getErrorCode(error),
        durationMs: Date.now() - startedAt,
        crossStore,
        rolledBack: !(error instanceof HttpException && error.getStatus() < 500),
        notificationIntentCount
      });
      if (isUniqueConflict(error)) {
        const concurrentReplay = await this.findCommand(storeId, commandId, binding);
        if (concurrentReplay !== undefined) return concurrentReplay;
        throw new ConflictException({ code: "COMMAND_ID_CONFLICT", message: "履约命令正在由其他请求处理，请使用相同标识重试" });
      }
      throw error;
    }
  }

  private async convertApprovedQuoteWithin(tx: Prisma.TransactionClient, user: UserWithStoreMember, quoteId: string) {
    const quote = await tx.salesQuote.findUnique({
      where: { id: quoteId },
      include: { items: true, capacityReservation: true, pricingCalculation: { select: { inputSnapshot: true } } }
    });
    if (!quote) throw new NotFoundException("报价单不存在");
    if (quote.convertedOrderId) return { payload: { orderId: quote.convertedOrderId, quoteId: quote.id }, applied: false };
    if (quote.status !== SalesQuoteStatus.APPROVED || quote.validUntil <= new Date()) throw new BadRequestException("只有有效的已批准报价单可以转订单");
    if (!quote.vehicleId) throw new BadRequestException("报价单未选择车辆，请补齐车辆后再生成正式订单");
    if (quote.costCompleteness === "TEMPORARY" && (quote.temporaryCostCents === null || !quote.temporaryCostReason?.trim())) {
      throw new BadRequestException("临时成本报价缺少冻结的金额或成本依据，不能转正式订单");
    }
    const pricingInput = quote.pricingCalculation.inputSnapshot as unknown as { constructionType?: ConstructionType; constructionLocation?: ConstructionLocation };
    if (!pricingInput.constructionType || !pricingInput.constructionLocation) throw new BadRequestException("报价单缺少施工快照");
    const claimed = await tx.salesQuote.updateMany({
      where: { id: quote.id, status: SalesQuoteStatus.APPROVED, convertedOrderId: null },
      data: { status: SalesQuoteStatus.CONVERTED }
    });
    if (claimed.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "报价单正在转订单或已完成转单" });
    const order = await this.createOrderUseCase.executeWithin(tx, user, {
      storeId: quote.storeId,
      executionStoreId: quote.executionStoreId,
      customerId: quote.customerId,
      vehicleId: quote.vehicleId,
      salesPersonId: quote.salesPersonId,
      constructionType: pricingInput.constructionType,
      constructionLocation: pricingInput.constructionLocation,
      constructionAddress: quote.constructionAddress ?? undefined,
      appointmentDate: quote.appointmentDate?.toISOString(),
      appointmentTimeSlot: quote.appointmentTimeSlot ?? undefined,
      items: quote.items.map((item) => ({ productId: item.productId, quantity: decimalToNumber(item.quantity), unitPriceCents: item.finalUnitPriceCents })),
      constructionChargeCents: quote.finalConstructionChargeCents ?? quote.finalLaborCostCents,
      pricingCalculationId: quote.pricingCalculationId,
      capacityReservationId: quote.capacityReservation?.id,
      remark: `由报价单 ${quote.quoteNo} 转入`
    }, {
      approvedQuote: true,
      allowTemporaryCost: quote.costCompleteness === "TEMPORARY",
      temporaryCost: quote.costCompleteness === "TEMPORARY" && quote.temporaryCostCents !== null && quote.temporaryCostReason
        ? { cents: quote.temporaryCostCents, reason: quote.temporaryCostReason }
        : undefined
    });
    await tx.salesQuote.update({ where: { id: quote.id }, data: { convertedOrderId: order.id } });
    await tx.auditEvent.create({
      data: { action: "sales_quote_converted", actorId: user.id, storeId: quote.storeId, targetType: "SalesQuote", targetId: quote.id, metadata: { orderId: order.id, storeId: quote.storeId } }
    });
    return { payload: { orderId: order.id, quoteId: quote.id }, applied: true };
  }

  getLifecycle(input: Parameters<typeof deriveOrderWorkflow>[0]): OrderWorkflow {
    return deriveOrderWorkflow(input);
  }

  getCapabilities(input: Parameters<typeof deriveOrderWorkflow>[0]) {
    return this.getLifecycle(input).capabilities;
  }

  listCapabilities(
    inputs: Array<{ id: string; workflow: Parameters<typeof deriveOrderWorkflow>[0] }>
  ) {
    return Object.fromEntries(
      inputs.map(({ id, workflow }) => [id, this.getCapabilities(workflow)])
    );
  }

  async getAuthoritativeLifecycle(user: UserWithStoreMember, orderId: string) {
    const order = await this.prisma.$transaction(async (tx) => tx.order.findUnique({
      where: { id: orderId },
      include: {
        amount: true,
        constructionRecord: { include: { photos: true, assignments: true } },
        inventoryAllocations: true,
        inventoryMovements: { where: { sourceType: "CONSTRUCTION_MATERIAL_PICKUP" }, select: { sourceId: true } },
        warranty: true,
        lifecycleVerificationCases: { orderBy: { detectedAt: "desc" }, take: 1 }
      }
    }), { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    if (!order) throw new NotFoundException("订单不存在");
    const canRead = await this.accessContext.can({ userId: user.id }, "orders", "read", { storeId: order.storeId, ownerId: order.salesPersonId }) ||
      await this.accessContext.can({ userId: user.id }, "construction", "read", { storeId: order.executionStoreId ?? order.storeId });
    if (!canRead) throw new ForbiddenException("无权限");
    const latestVerification = order.lifecycleVerificationCases[0];
    const hasOpenVerification = latestVerification?.status === "OPEN";
    const workflow = deriveOrderWorkflow({
      status: order.status,
      amount: order.amount,
      constructionRecord: order.constructionRecord,
      inventoryAllocations: order.inventoryAllocations,
      pickedAllocationIds: order.inventoryMovements.map((movement) => movement.sourceId).filter((sourceId): sourceId is string => Boolean(sourceId)),
      warranty: order.warranty,
      historicalQualityMissing: hasOpenVerification
      , historicalQualityResolved: latestVerification?.status === "RESOLVED"
    });
    const executionStoreId = order.executionStoreId ?? order.storeId;
    const [canConstructionWrite, canFinalize, canCancel, canOrderWrite, canVerificationView, canVerificationResolve] = await Promise.all([
      this.accessContext.can({ userId: user.id }, "construction", "write", { storeId: executionStoreId }),
      this.accessContext.can({ userId: user.id }, "orders.lifecycle", "finalize", { storeId: order.storeId }),
      this.accessContext.can({ userId: user.id }, "orders.lifecycle", "cancel", { storeId: order.storeId }),
      this.accessContext.can({ userId: user.id }, "orders", "write", { storeId: order.storeId, ownerId: order.salesPersonId }),
      this.accessContext.can({ userId: user.id }, "orders.lifecycle", "verification_view", { storeId: order.storeId }),
      this.accessContext.can({ userId: user.id }, "orders.lifecycle", "verification_resolve", { storeId: order.storeId })
    ]);
    const assigned = order.constructionRecord?.assignments.some((item) => item.workerUserId === user.id) ?? false;
    const globalBlock = hasOpenVerification ? ["HISTORICAL_VERIFICATION_REQUIRED"] : [];
    const capability = (visible: boolean, allowedByFacts: boolean, reasons: string[] = []): LifecycleActionCapability => ({
      visible,
      enabled: visible && allowedByFacts && globalBlock.length === 0,
      blockingReasonCodes: globalBlock.length ? globalBlock : (allowedByFacts ? [] : reasons)
    });
    const verificationCapability = (visible: boolean, allowedByFacts: boolean): LifecycleActionCapability => ({
      visible,
      enabled: visible && allowedByFacts,
      blockingReasonCodes: allowedByFacts ? [] : ["NO_OPEN_VERIFICATION"]
    });
    const stage = workflow.currentStage;
    return {
      orderId: order.id,
      lifecycleVersion: order.lifecycleVersion,
      currentStage: stage,
      paymentStatus: workflow.paymentStatus,
      inventoryStatus: workflow.inventoryStatus,
      qualityStatus: workflow.qualityStatus,
      warrantyStatus: workflow.warrantyStatus,
      blockingReasonCodes: [...new Set([...globalBlock, ...workflow.blockingReasons])],
      capabilities: {
        collectBalance: capability(canOrderWrite, workflow.capabilities.canCollectBalance, ["BALANCE_NOT_DUE"]),
        dispatch: capability(canConstructionWrite, stage === "PENDING_DISPATCH", ["ORDER_NOT_READY_FOR_DISPATCH"]),
        startConstruction: capability(canConstructionWrite || assigned, stage === "READY_TO_START", ["MATERIAL_PICKUP_REQUIRED"]),
        completeConstruction: capability(canConstructionWrite || assigned, stage === "IN_CONSTRUCTION" || stage === "REWORKING", ["ORDER_NOT_IN_CONSTRUCTION"]),
        qualityCheck: capability(canConstructionWrite, stage === "PENDING_QUALITY", ["CONSTRUCTION_NOT_COMPLETED"]),
        finalDelivery: capability(canFinalize, workflow.capabilities.canCompleteOrder, workflow.blockingReasons),
        cancel: capability(canCancel, !["COMPLETED", "CANCELLED", "HISTORICAL_VERIFICATION"].includes(stage), ["ORDER_TERMINAL"]),
        returnToPendingDispatch: capability(canOrderWrite, stage === "PENDING_MATERIAL_PICKUP" || stage === "READY_TO_START", ["RETURN_NOT_ALLOWED"]),
        viewVerification: verificationCapability(canVerificationView, hasOpenVerification),
        resolveVerification: verificationCapability(canVerificationResolve, hasOpenVerification)
      },
      actionImpactSummaries: {
        finalDelivery: "完成最终交付后将激活质保并关闭履约待办，操作不可撤销。",
        cancel: "取消将释放尚未出库的库存锁定与施工容量，并关闭未开工任务。",
        returnToPendingDispatch: "退回将清除当前派工人员并释放尚未出库的库存锁定与施工容量。"
      },
      generatedAt: new Date().toISOString()
    };
  }

  async listAuthoritativeLifecycle(user: UserWithStoreMember, orderIds: string[]) {
    const entries = await Promise.all(orderIds.map(async (orderId) => {
      try {
        return [orderId, { ok: true as const, value: await this.getAuthoritativeLifecycle(user, orderId) }] as const;
      } catch (error) {
        if (error instanceof ForbiddenException || error instanceof NotFoundException) {
          return [orderId, { ok: false as const, error: { code: "ORDER_NOT_AVAILABLE" } }] as const;
        }
        throw error;
      }
    }));
    return Object.fromEntries(entries);
  }

  async transition(
    user: UserWithStoreMember,
    orderId: string,
    command: OrderLifecycleCommand,
    rawContext: OrderLifecycleTransitionContext
  ) {
    const startedAt = Date.now();
    const source = rawContext.source;
    const accessContext = this.accessContext;
    const reason = "reason" in command ? command.reason.trim() : "";
    if ((command.type === "CANCEL" || command.type === "RETURN_TO_PENDING_DISPATCH") && !reason) {
      throw new BadRequestException(command.type === "CANCEL" ? "取消订单必须填写原因" : "反审核退回必须填写原因");
    }
    const header = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, storeId: true, executionStoreId: true, salesPersonId: true, status: true, lifecycleVersion: true }
    });
    if (!header) throw new NotFoundException("订单不存在");
    if (isConstructionCommand(command)) {
      await this.constructionImplementation.assertAccess(this.prisma as unknown as Prisma.TransactionClient, user, header, command);
    } else if (isCrossStoreCommand(command)) {
      const task = await this.prisma.crossStoreConstructionTask.findUnique({ where: { id: command.taskId } });
      if (!task || task.orderId !== orderId) throw new NotFoundException("跨门店施工任务不存在");
      const sourceAction = command.type === "CANCEL_CROSS_STORE_TASK" || command.type === "ACCEPT_CROSS_STORE_BY_SOURCE";
      const allowed = sourceAction
        ? await accessContext.can({ userId: user.id }, "orders.lifecycle", "cross_store_source_manage", { storeId: task.sourceStoreId })
        : await accessContext.can({ userId: user.id }, "construction", "write", { storeId: task.executionStoreId });
      if (!allowed) throw new ForbiddenException("无权限");
    } else {
      const capability = command.type === "FINAL_DELIVERY" ? "finalize" : command.type === "CANCEL" ? "cancel" : command.type === "RESOLVE_HISTORICAL_VERIFICATION" ? "verification_resolve" : null;
      const allowed = capability
        ? await accessContext.can({ userId: user.id }, "orders.lifecycle", capability, { storeId: header.storeId })
        : await accessContext.can({ userId: user.id }, "orders", "write", { storeId: header.storeId, ownerId: header.salesPersonId });
      if (!allowed) throw new ForbiddenException("无权限");
    }
    const openVerification = await this.prisma.orderLifecycleVerificationCase.findFirst({
      where: { orderId, status: "OPEN" },
      select: { id: true, issueCodes: true }
    });
    if (openVerification && command.type !== "RESOLVE_HISTORICAL_VERIFICATION") {
      throw new ConflictException({
        code: "HISTORICAL_VERIFICATION_REQUIRED",
        message: "订单存在待处理的履约核验问题，暂不能继续操作",
        verificationCaseId: openVerification.id
      });
    }

    const commandId = requireCommandId(rawContext?.commandId);
    const expectedVersion = requireExpectedVersion(rawContext?.expectedVersion);
    const binding = {
      actorId: user.id,
      commandType: command.type,
      targetType: "ORDER",
      targetId: orderId,
      requestFingerprint: fingerprintCommand(command.type, orderId, command)
    };
    const replay = await this.findCommand(header.storeId, commandId, binding);
    if (replay !== undefined) {
      this.observability?.record({
        commandType: command.type,
        source,
        replayed: true,
        beforeVersion: expectedVersion,
        afterVersion: expectedVersion,
        resultCode: getLifecycleResultCode(replay),
        durationMs: Date.now() - startedAt,
        crossStore: isCrossStoreCommand(command),
        rolledBack: false,
        notificationIntentCount: null
      });
      return replay;
    }

    let notificationIntentCount = 0;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
      const observedTx = withNotificationCounter(tx, (count) => { notificationIntentCount += count; });
      const record = await tx.orderLifecycleCommandRecord.create({
        data: {
          orderId,
          storeId: header.storeId,
          commandId,
          ...binding,
          expectedVersion,
          status: OrderLifecycleCommandStatus.SUCCEEDED,
          inputSummary: toJsonValue({ caller: rawContext.source, command }) as Prisma.InputJsonValue
        }
      });
      try {
        const current = await tx.order.findUnique({
          where: { id: orderId },
          select: { id: true, storeId: true, salesPersonId: true, status: true, lifecycleVersion: true }
        });
        if (!current) throw new NotFoundException("订单不存在");
        if (current.lifecycleVersion !== expectedVersion) {
          throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "订单已被其他操作更新，请刷新后重试", latestVersion: current.lifecycleVersion });
        }
        const execution = isConstructionCommand(command) || isCrossStoreCommand(command)
          ? await this.constructionImplementation.execute(observedTx, user, { ...current, executionStoreId: header.executionStoreId }, command, expectedVersion)
          : await this.executeOrderCommandWithin(observedTx, user, current, command, reason, expectedVersion);
        const afterVersion = execution.applied ? expectedVersion + 1 : expectedVersion;
        if (execution.applied) await tx.orderLifecycleVersionChange.create({
          data: { orderId, beforeVersion: expectedVersion, afterVersion, sourceType: "COMMAND", sourceKey: record.id, sourceRefs: { commandId, commandType: command.type } }
        });
        await tx.orderLifecycleCommandRecord.update({
          where: { id: record.id },
          data: { beforeVersion: expectedVersion, afterVersion, resultSummary: toJsonValue(execution.payload) as Prisma.InputJsonValue, completedAt: new Date() }
        });
        return { payload: execution.payload };
      } catch (error) {
        if (!(error instanceof HttpException) || error.getStatus() >= 500) throw error;
        const response = error.getResponse();
        const summary = typeof response === "string"
          ? { code: "COMMAND_PRECONDITION_FAILED", message: response, httpStatus: error.getStatus() }
          : { ...(response as object), httpStatus: error.getStatus() };
        await tx.orderLifecycleCommandRecord.update({
          where: { id: record.id },
          data: { status: OrderLifecycleCommandStatus.REJECTED, beforeVersion: expectedVersion, afterVersion: expectedVersion, resultSummary: summary as Prisma.InputJsonValue, completedAt: new Date() }
        });
        return { rejected: summary };
      }
      });
      if ("rejected" in result) replayStoredRejection(result.rejected);
      this.observability?.record({
        commandType: command.type,
        source,
        replayed: false,
        beforeVersion: expectedVersion,
        afterVersion: expectedVersion + 1,
        resultCode: getLifecycleResultCode(result.payload),
        durationMs: Date.now() - startedAt,
        crossStore: isCrossStoreCommand(command),
        rolledBack: false,
        notificationIntentCount
      });
      return result.payload;
    } catch (error) {
      this.observability?.record({
        commandType: command.type,
        source,
        replayed: false,
        beforeVersion: expectedVersion,
        afterVersion: null,
        resultCode: getErrorCode(error),
        durationMs: Date.now() - startedAt,
        crossStore: isCrossStoreCommand(command),
        rolledBack: !(error instanceof HttpException && error.getStatus() < 500),
        notificationIntentCount
      });
      if (isUniqueConflict(error)) {
        const replay = await this.findCommand(header.storeId, commandId, binding);
        if (replay !== undefined) return replay;
      }
      throw error;
    }
  }

  private async executeOrderCommandWithin(
    tx: Prisma.TransactionClient,
    user: UserWithStoreMember,
    order: { id: string; storeId: string; salesPersonId: string; status: OrderStatus; lifecycleVersion: number },
    command: OrderLifecycleCommand,
    reason: string,
    expectedVersion: number
  ) {
    if (command.type === "FINAL_DELIVERY") {
      const payload = await finalizeOrderDelivery(tx, order.id, user.id, expectedVersion);
      return { payload, applied: payload.status === "COMPLETED" };
    }
    if (command.type === "RESOLVE_HISTORICAL_VERIFICATION") {
      const summary = command.input.summary.trim();
      const factRefs = command.input.factRefs.map((ref) => ref.trim()).filter(Boolean);
      if (!summary || factRefs.length === 0) throw new BadRequestException({ code: "VERIFICATION_EVIDENCE_REQUIRED", message: "历史核验必须填写结论和事实引用" });
      const orderFacts = await tx.order.findUnique({ where: { id: order.id }, select: { status: true, constructionRecord: { select: { qualityResult: true } } } });
      if (!orderFacts || (orderFacts.status !== OrderStatus.COMPLETED && orderFacts.status !== OrderStatus.WARRANTIED)) throw new BadRequestException("仅历史完成订单可核验");
      if (orderFacts.constructionRecord?.qualityResult != null) throw new BadRequestException("该订单已有质检结果，无需历史核验");
      let verification = await tx.orderLifecycleVerificationCase.findFirst({ where: { orderId: order.id, status: "OPEN" }, orderBy: { detectedAt: "desc" } });
      if (!verification) {
        verification = await tx.orderLifecycleVerificationCase.create({ data: { orderId: order.id, issueCodes: ["QUALITY_RESULT_MISSING"], status: "OPEN", detectedBy: user.id } });
      }
      const resolved = await tx.orderLifecycleVerificationCase.updateMany({
        where: { id: verification.id, status: "OPEN" },
        data: { status: "RESOLVED", resolutionSummary: { summary, factRefs }, resolvedAt: new Date(), resolvedBy: user.id }
      });
      if (resolved.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "历史核验已被其他操作处理，请刷新后重试" });
      const versioned = await tx.order.updateMany({
        where: { id: order.id, lifecycleVersion: expectedVersion },
        data: { lifecycleVersion: { increment: 1 } }
      });
      if (versioned.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "订单已被其他操作更新，请刷新后重试" });
      await tx.auditEvent.create({ data: { action: "HISTORICAL_ORDER_VERIFIED", actorId: user.id, storeId: order.storeId, targetType: "order", targetId: order.id, metadata: { orderId: order.id, summary, factRefs } } });
      return { payload: { orderId: order.id, verificationCaseId: verification.id, status: "RESOLVED", summary, factRefs }, applied: true };
    }
    if (command.type === "CANCEL") {
      if (order.status === OrderStatus.CANCELLED) {
        if (await this.hasResidualReversibleFacts(tx, order.id)) {
          throw new ConflictException({ code: "HISTORICAL_VERIFICATION_REQUIRED", message: "已取消订单仍存在未收口履约事实，请先完成历史核验" });
        }
        return { payload: { id: order.id, status: order.status }, applied: false };
      }
      if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.WARRANTIED) throw new BadRequestException("当前订单阶段不允许取消");
      const irreversible = await tx.order.findUnique({
        where: { id: order.id },
        select: { payments: { take: 1, select: { id: true } }, constructionRecord: { select: { startedAt: true } }, inventoryAllocations: { where: { status: "OUTBOUND" }, take: 1, select: { id: true } } }
      });
      if (irreversible?.payments.length) throw new BadRequestException({ code: "IRREVERSIBLE_CASH_FACT", message: "订单已有收款事实，不能直接取消" });
      if (irreversible?.constructionRecord?.startedAt) throw new BadRequestException({ code: "CONSTRUCTION_ALREADY_STARTED", message: "订单已开工，不能直接取消" });
      if (irreversible?.inventoryAllocations.length) throw new BadRequestException({ code: "INVENTORY_ALREADY_OUTBOUND", message: "订单已出库，不能直接取消" });
      const updated = await tx.order.updateMany({
        where: { id: order.id, lifecycleVersion: expectedVersion, status: { notIn: [OrderStatus.COMPLETED, OrderStatus.WARRANTIED, OrderStatus.CANCELLED] } },
        data: { status: OrderStatus.CANCELLED, lifecycleVersion: { increment: 1 } }
      });
      if (updated.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "订单已被其他操作更新，请刷新后重试" });
      await this.releaseReversibleFacts(tx, order.id, user.id, "ORDER_CANCELLED");
      await tx.constructionAssignment.deleteMany({ where: { orderId: order.id } });
      await tx.constructionRecord.updateMany({
        where: { orderId: order.id, startedAt: null },
        data: { status: "CANCELLED" }
      });
      await tx.crossStoreConstructionTask.updateMany({
        where: { orderId: order.id, status: { in: ["PENDING_ACCEPTANCE", "READY_TO_DISPATCH", "DISPATCHED"] } },
        data: { status: "CANCELLED", cancellationReason: reason, cancelledAt: new Date(), version: { increment: 1 } }
      });
      await tx.notification.updateMany({ where: { type: NotificationType.ORDER_BALANCE_DUE, todoKey: { contains: `:${order.id}:` }, handledAt: null }, data: { handledAt: new Date() } });
      await tx.auditEvent.create({ data: { action: "ORDER_CANCELLED", actorId: user.id, storeId: order.storeId, targetType: "order", targetId: order.id, metadata: { orderId: order.id, reason, beforeStatus: order.status, afterStatus: OrderStatus.CANCELLED } } });
      return { payload: { id: order.id, status: OrderStatus.CANCELLED }, applied: true };
    }
    if (order.status === OrderStatus.CANCELLED) throw new BadRequestException("已取消订单不能退回修改");
    if (order.status === OrderStatus.PENDING_DISPATCH) {
      if (await this.hasResidualReversibleFacts(tx, order.id)) {
        throw new ConflictException({ code: "HISTORICAL_VERIFICATION_REQUIRED", message: "待派单订单仍存在未收口履约事实，请先完成历史核验" });
      }
      return { payload: { id: order.id, status: order.status }, applied: false };
    }
    const construction = await tx.constructionRecord.findUnique({ where: { orderId: order.id }, select: { id: true, status: true, startedAt: true } });
    const outbound = await tx.orderInventoryAllocation.findFirst({ where: { orderId: order.id, status: "OUTBOUND" }, select: { id: true } });
    if (construction?.startedAt || construction?.status === "IN_CONSTRUCTION" || outbound) throw new BadRequestException("已开工或已出库订单不能退回待派单");
    const updated = await tx.order.updateMany({
      where: { id: order.id, lifecycleVersion: expectedVersion, status: { notIn: [OrderStatus.CANCELLED, OrderStatus.COMPLETED, OrderStatus.WARRANTIED] } },
      data: { status: OrderStatus.PENDING_DISPATCH, lifecycleVersion: { increment: 1 } }
    });
    if (updated.count !== 1) throw new ConflictException({ code: "LIFECYCLE_VERSION_CONFLICT", message: "订单已被其他操作更新，请刷新后重试" });
    if (construction) {
      await tx.constructionAssignment.deleteMany({ where: { recordId: construction.id } });
      await tx.constructionRecord.update({ where: { id: construction.id }, data: { status: "CANCELLED" } });
    }
    await this.releaseReversibleFacts(tx, order.id, user.id, "RETURN_TO_PENDING_DISPATCH");
    await tx.crossStoreConstructionTask.updateMany({
      where: { orderId: order.id, status: { in: ["DISPATCHED"] } },
      data: { status: "READY_TO_DISPATCH", dispatchedAt: null, version: { increment: 1 } }
    });
    await tx.auditEvent.create({ data: { action: "ORDER_RETURNED_TO_PENDING_DISPATCH", actorId: user.id, storeId: order.storeId, targetType: "order", targetId: order.id, metadata: { storeId: order.storeId, reason, beforeStatus: order.status, afterStatus: OrderStatus.PENDING_DISPATCH } } });
    return { payload: { id: order.id, status: OrderStatus.PENDING_DISPATCH }, applied: true };
  }

  private async releaseReversibleFacts(
    tx: Prisma.TransactionClient,
    orderId: string,
    actorId: string,
    reasonCode: string
  ) {
    const allocations = await tx.orderInventoryAllocation.findMany({
      where: { orderId, status: "LOCKED" }
    });
    for (const allocation of allocations) {
      const quantity = decimalToNumber(allocation.lockedQuantity) - decimalToNumber(allocation.outboundQuantity);
      if (quantity <= 0) continue;
      await tx.inventoryBatch.update({
        where: { id: allocation.batchId },
        data: { availableQuantity: { increment: quantity }, lockedQuantity: { decrement: quantity } }
      });
      await tx.orderInventoryAllocation.update({ where: { id: allocation.id }, data: { status: "RELEASED" } });
      await tx.inventoryMovement.create({
        data: {
          storeId: allocation.storeId,
          batchId: allocation.batchId,
          productId: allocation.productId,
          orderId,
          movementType: InventoryMovementType.STOCK_RELEASE,
          quantity,
          sourceType: "ORDER_LIFECYCLE_RELEASE",
          sourceId: allocation.id,
          idempotencyKey: reasonCode,
          createdById: actorId,
          note: reasonCode
        }
      });
    }
    const reservation = await tx.capacityReservation.findUnique({ where: { orderId } });
    if (!reservation || (reservation.status !== CapacityReservationStatus.HELD && reservation.status !== CapacityReservationStatus.CONFIRMED)) return;
    const capacity = await tx.dailyCapacity.findUnique({ where: { id: reservation.dailyCapacityId } });
    if (capacity) {
      const data: Prisma.DailyCapacityUpdateInput = {};
      if (reservation.constructionLocation === ConstructionLocation.IN_STORE && capacity.inStoreReserved > 0) data.inStoreReserved = { decrement: 1 };
      if (reservation.constructionLocation === ConstructionLocation.OUTSIDE && capacity.outsideReserved > 0) data.outsideReserved = { decrement: 1 };
      if (reservation.constructionType === ConstructionType.HEAT_FILM && capacity.heatFilmReserved > 0) data.heatFilmReserved = { decrement: 1 };
      if (reservation.constructionType === ConstructionType.INSPECTION && capacity.inspectionReserved > 0) data.inspectionReserved = { decrement: 1 };
      await tx.dailyCapacity.update({ where: { id: capacity.id }, data });
    }
    await tx.capacityReservation.update({
      where: { id: reservation.id },
      data: { status: CapacityReservationStatus.RELEASED, releasedReasonCode: reasonCode }
    });
  }

  private async hasResidualReversibleFacts(tx: Prisma.TransactionClient, orderId: string) {
    const [assignment, allocation, reservation, record, crossStoreTask, todo] = await Promise.all([
      tx.constructionAssignment.findFirst({ where: { orderId }, select: { id: true } }),
      tx.orderInventoryAllocation.findFirst({ where: { orderId, status: "LOCKED" }, select: { id: true } }),
      tx.capacityReservation.findFirst({ where: { orderId, status: { in: [CapacityReservationStatus.HELD, CapacityReservationStatus.CONFIRMED] } }, select: { id: true } }),
      tx.constructionRecord.findFirst({ where: { orderId, status: { not: "CANCELLED" } }, select: { id: true } }),
      tx.crossStoreConstructionTask.findFirst({ where: { orderId, status: { notIn: ["CANCELLED", "REJECTED", "COMPLETED"] } }, select: { id: true } }),
      tx.notification.findFirst({ where: { type: NotificationType.ORDER_BALANCE_DUE, todoKey: { contains: `:${orderId}:` }, handledAt: null }, select: { id: true } })
    ]);
    return Boolean(assignment || allocation || reservation || record || crossStoreTask || todo);
  }

  private async findCommand(
    storeId: string,
    commandId: string,
    binding: {
      actorId: string;
      commandType: string;
      targetType: string;
      targetId: string;
      requestFingerprint: string;
    }
  ) {
    const existing = await this.prisma.orderLifecycleCommandRecord.findUnique({
      where: { storeId_commandId: { storeId, commandId } }
    });
    if (!existing) return undefined;
    assertCommandBinding(existing, binding);
    if (existing.status === OrderLifecycleCommandStatus.REJECTED) {
      replayStoredRejection(existing.resultSummary);
    }
    return existing.resultSummary;
  }
}

function isConstructionCommand(
  command: OrderLifecycleCommand
): command is Extract<OrderLifecycleCommand, { type: "DISPATCH" | "START_CONSTRUCTION" | "COMPLETE_CONSTRUCTION" | "QUALITY_CHECK" }> {
  return command.type === "DISPATCH" || command.type === "START_CONSTRUCTION" || command.type === "COMPLETE_CONSTRUCTION" || command.type === "QUALITY_CHECK";
}

function isCrossStoreCommand(command: OrderLifecycleCommand): command is Extract<OrderLifecycleCommand, { taskId: string }> {
  return "taskId" in command;
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function decimalToNumber(value: number | { toNumber?: () => number; toString(): string }) {
  if (typeof value === "number") return value;
  return typeof value.toNumber === "function" ? value.toNumber() : Number(value.toString());
}

function getLifecycleResultCode(value: unknown) {
  if (isRecord(value)) {
    if (typeof value.outcome === "string") return value.outcome;
    if (value.status === "IDEMPOTENT") return "ALREADY_SATISFIED";
  }
  return "APPLIED";
}

function getErrorCode(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (isRecord(response) && typeof response.code === "string") return response.code;
    return `HTTP_${error.getStatus()}`;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) return error.code;
  return error instanceof Error ? error.name : "UNKNOWN_ERROR";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withNotificationCounter(
  tx: Prisma.TransactionClient,
  onCreateMany: (count: number) => void
): Prisma.TransactionClient {
  const notificationDelegate = tx.notification;
  if (!notificationDelegate || typeof notificationDelegate !== "object") return tx;
  const observedNotificationDelegate = new Proxy(notificationDelegate, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property !== "createMany" || typeof value !== "function") return value;
      return async (args: { data?: unknown[] | unknown }) => {
        const data = Array.isArray(args?.data) ? args.data : args?.data == null ? [] : [args.data];
        onCreateMany(data.length);
        return value.call(target, args);
      };
    }
  });
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === "notification") return observedNotificationDelegate;
      return Reflect.get(target, property, receiver);
    }
  });
}
