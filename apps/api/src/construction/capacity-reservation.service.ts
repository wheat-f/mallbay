import { BadRequestException, Injectable, Optional } from "@nestjs/common";
import { CapacityReservationSourceType, CapacityReservationStatus, ConstructionLocation, ConstructionType, Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AuditLogService } from "../observability/audit-log.service";
import type { AuditEvent } from "../observability/audit-log.service";
import { AuditEventWriter } from "../observability/audit-event-writer";
import { persistAuditEvent } from "../observability/persist-audit-event";

@Injectable()
export class CapacityReservationService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly audit?: AuditLogService,
    @Optional() private readonly auditWriter?: AuditEventWriter
  ) {}

  async holdQuote(input: {
    storeId: string;
    quoteId: string;
    appointmentDate?: string;
    constructionLocation: ConstructionLocation;
    constructionType: ConstructionType;
    expiresAt: Date;
  }) {
    if (!input.appointmentDate) return null;
    const reservation = await this.prisma.$transaction((tx) => this.holdQuoteWithin(tx, input));
    if (reservation) await this.recordAudit({ action: "capacity_quote_held", targetType: "CapacityReservation", targetId: reservation.id, metadata: { quoteId: input.quoteId, storeId: input.storeId, expiresAt: reservation.expiresAt?.toISOString() } });
    return reservation;
  }

  async holdQuoteWithin(
    tx: Prisma.TransactionClient,
    input: {
      storeId: string;
      quoteId: string;
      appointmentDate?: string;
      constructionLocation: ConstructionLocation;
      constructionType: ConstructionType;
      expiresAt: Date;
    }
  ) {
    if (!input.appointmentDate) return null;
    const date = normalizeDate(input.appointmentDate);
    const existing = await tx.capacityReservation.findUnique({ where: { quoteId: input.quoteId } });
    if (existing && isActiveStatus(existing.status)) return existing;
    const capacity = await tx.dailyCapacity.findUnique({ where: { storeId_date: { storeId: input.storeId, date } } });
    if (!capacity) throw new BadRequestException("请先设置施工容量");
    const increments = getCapacityIncrements(capacity, input.constructionLocation, input.constructionType);
    const updated = await tx.dailyCapacity.updateMany({
      where: { id: capacity.id, ...getCapacityAvailabilityWhere(capacity, input.constructionLocation, input.constructionType) },
      data: increments
    });
    if (updated.count !== 1) throw new BadRequestException("施工容量已满，请刷新后重试");
    return tx.capacityReservation.create({
      data: {
        storeId: input.storeId,
        dailyCapacityId: capacity.id,
        date,
        constructionLocation: input.constructionLocation,
        constructionType: input.constructionType,
        sourceType: CapacityReservationSourceType.QUOTE,
        quoteId: input.quoteId,
        status: CapacityReservationStatus.HELD,
        expiresAt: input.expiresAt
      }
    });
  }

  async confirmQuote(quoteId: string) {
    const result = await this.prisma.capacityReservation.updateMany({
      where: { quoteId, status: CapacityReservationStatus.HELD },
      data: { status: CapacityReservationStatus.CONFIRMED }
    });
    if (result.count) await this.recordAudit({ action: "capacity_quote_confirmed", targetType: "CapacityReservation", metadata: { quoteId, count: result.count } });
    return result;
  }

  async releaseQuote(quoteId: string, reasonCode: string, status: CapacityReservationStatus = CapacityReservationStatus.RELEASED) {
    const result = await this.prisma.$transaction(async (tx) => {
      const reservation = await tx.capacityReservation.findUnique({ where: { quoteId } });
      if (!reservation || !isActiveStatus(reservation.status)) {
        return reservation;
      }
      const capacity = await tx.dailyCapacity.findUnique({ where: { id: reservation.dailyCapacityId } });
      if (capacity) {
        await tx.dailyCapacity.update({
          where: { id: capacity.id },
          data: getCapacityDecrements(capacity, reservation.constructionLocation, reservation.constructionType)
        });
      }
      return tx.capacityReservation.update({ where: { id: reservation.id }, data: { status, releasedReasonCode: reasonCode } });
    });
    if (result && "id" in result) {
      await this.recordAudit({ action: result.status === status ? "capacity_quote_released" : "capacity_quote_release_ignored", targetType: "CapacityReservation", targetId: result.id, metadata: { quoteId, reasonCode, requestedStatus: status, resultingStatus: result.status } });
    }
    return result;
  }

  async releaseExpired(now = new Date()) {
    const reservations = await this.prisma.capacityReservation.findMany({
      where: { status: CapacityReservationStatus.HELD, expiresAt: { lte: now } },
      select: { quoteId: true }
    });
    for (const reservation of reservations) {
      if (reservation.quoteId) await this.releaseQuote(reservation.quoteId, "EXPIRED", CapacityReservationStatus.EXPIRED);
    }
    return reservations.length;
  }

  async reconcile(storeId: string, date: string, apply = false) {
    const normalizedDate = normalizeDate(date);
    const capacity = await this.prisma.dailyCapacity.findUnique({ where: { storeId_date: { storeId, date: normalizedDate } }, include: { reservations: true } });
    if (!capacity) return { storeId, date: normalizedDate, found: false, corrected: false };
    const active = capacity.reservations.filter((item) => isActiveStatus(item.status));
    const expected = {
      inStoreReserved: active.filter((item) => item.constructionLocation === ConstructionLocation.IN_STORE).length,
      outsideReserved: active.filter((item) => item.constructionLocation === ConstructionLocation.OUTSIDE).length,
      heatFilmReserved: active.filter((item) => item.constructionType === ConstructionType.HEAT_FILM).length,
      inspectionReserved: active.filter((item) => item.constructionType === ConstructionType.INSPECTION).length
    };
    const mismatch = Object.keys(expected).some((key) => capacity[key as keyof typeof expected] !== expected[key as keyof typeof expected]);
    if (apply && mismatch) {
      await this.prisma.dailyCapacity.update({ where: { id: capacity.id }, data: expected });
      await this.recordAudit({ action: "capacity_reconciled", targetType: "DailyCapacity", targetId: capacity.id, metadata: { storeId, date: normalizedDate } });
    }
    return {
      storeId,
      date: normalizedDate,
      found: true,
      mismatch,
      corrected: apply && mismatch,
      actual: { inStoreReserved: capacity.inStoreReserved, outsideReserved: capacity.outsideReserved, heatFilmReserved: capacity.heatFilmReserved, inspectionReserved: capacity.inspectionReserved },
      expected
    };
  }

  async reconcileToday(now = new Date()) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const capacities = await this.prisma.dailyCapacity.findMany({ where: { date }, select: { storeId: true } });
    let corrected = 0;
    for (const capacity of capacities) {
      const result = await this.reconcile(capacity.storeId, date.toISOString(), true);
      if (result.corrected) corrected += 1;
    }
    return corrected;
  }

  private async recordAudit(event: AuditEvent) {
    if (this.auditWriter) return this.auditWriter.writeTransactional(this.prisma, event);
    this.audit?.record(event);
    await persistAuditEvent(this.prisma, event);
  }
}

function getCapacityIncrements(
  capacity: {
    inStoreCapacity: number; inStoreReserved: number; outsideCapacity: number; outsideReserved: number;
    heatFilmCapacity: number; heatFilmReserved: number; inspectionCapacity: number; inspectionReserved: number;
  },
  location: ConstructionLocation,
  type: ConstructionType
): Prisma.DailyCapacityUpdateInput {
  const data: Prisma.DailyCapacityUpdateInput = {};
  if (location === ConstructionLocation.IN_STORE) {
    assertAvailable(capacity.inStoreReserved, capacity.inStoreCapacity);
    data.inStoreReserved = { increment: 1 };
  } else {
    assertAvailable(capacity.outsideReserved, capacity.outsideCapacity);
    data.outsideReserved = { increment: 1 };
  }
  if (type === ConstructionType.HEAT_FILM) {
    assertAvailable(capacity.heatFilmReserved, capacity.heatFilmCapacity);
    data.heatFilmReserved = { increment: 1 };
  }
  if (type === ConstructionType.INSPECTION) {
    assertAvailable(capacity.inspectionReserved, capacity.inspectionCapacity);
    data.inspectionReserved = { increment: 1 };
  }
  return data;
}

function getCapacityDecrements(
  capacity: { inStoreReserved: number; outsideReserved: number; heatFilmReserved: number; inspectionReserved: number },
  location: ConstructionLocation,
  type: ConstructionType
): Prisma.DailyCapacityUpdateInput {
  const data: Prisma.DailyCapacityUpdateInput = {};
  if (location === ConstructionLocation.IN_STORE && capacity.inStoreReserved > 0) data.inStoreReserved = { decrement: 1 };
  if (location === ConstructionLocation.OUTSIDE && capacity.outsideReserved > 0) data.outsideReserved = { decrement: 1 };
  if (type === ConstructionType.HEAT_FILM && capacity.heatFilmReserved > 0) data.heatFilmReserved = { decrement: 1 };
  if (type === ConstructionType.INSPECTION && capacity.inspectionReserved > 0) data.inspectionReserved = { decrement: 1 };
  return data;
}

function getCapacityAvailabilityWhere(
  capacity: { inStoreCapacity: number; inStoreReserved: number; outsideCapacity: number; outsideReserved: number; heatFilmCapacity: number; heatFilmReserved: number; inspectionCapacity: number; inspectionReserved: number },
  location: ConstructionLocation,
  type: ConstructionType
): Prisma.DailyCapacityWhereInput {
  const where: Prisma.DailyCapacityWhereInput = {};
  if (location === ConstructionLocation.IN_STORE) where.inStoreReserved = { lt: capacity.inStoreCapacity };
  else where.outsideReserved = { lt: capacity.outsideCapacity };
  if (type === ConstructionType.HEAT_FILM) where.heatFilmReserved = { lt: capacity.heatFilmCapacity };
  if (type === ConstructionType.INSPECTION) where.inspectionReserved = { lt: capacity.inspectionCapacity };
  return where;
}

function assertAvailable(reserved: number, capacity: number) {
  if (reserved >= capacity) throw new BadRequestException("施工容量已满");
}

function isActiveStatus(status: CapacityReservationStatus) {
  return status === CapacityReservationStatus.HELD || status === CapacityReservationStatus.CONFIRMED;
}

function normalizeDate(value: string) {
  const datePart = value.includes("T") ? value.slice(0, 10) : value;
  return new Date(`${datePart}T00:00:00.000Z`);
}
