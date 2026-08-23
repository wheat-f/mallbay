import type { AuthenticatedConstructionUser } from "../construction.service";
import type { LeaveRequestDto, ListConstructionDto, UpdateLeaveRequestDto, UpsertDailyCapacityDto, UpdateDailyCapacityDto, UpsertScheduleDto, UpsertWorkerProfileDto } from "../dto/construction.dto";

export const CONSTRUCTION_MANAGEMENT = Symbol("CONSTRUCTION_MANAGEMENT");

/** Management seam only; fulfillment, evidence and stock facts remain elsewhere. */
export interface ConstructionManagement {
  listCapacities(user: AuthenticatedConstructionUser, query: ListConstructionDto): Promise<unknown>;
  upsertCapacity(user: AuthenticatedConstructionUser, dto: UpsertDailyCapacityDto): Promise<unknown>;
  updateCapacity(user: AuthenticatedConstructionUser, id: string, dto: UpdateDailyCapacityDto): Promise<unknown>;
  upsertWorker(user: AuthenticatedConstructionUser, dto: UpsertWorkerProfileDto): Promise<unknown>;
  listWorkers(user: AuthenticatedConstructionUser, storeId: string): Promise<unknown>;
  createLeave(user: AuthenticatedConstructionUser, dto: LeaveRequestDto, rawClientOperationId?: string): Promise<unknown>;
  listLeaves(user: AuthenticatedConstructionUser, storeId: string): Promise<unknown>;
  updateLeave(user: AuthenticatedConstructionUser, id: string, dto: UpdateLeaveRequestDto): Promise<unknown>;
  upsertSchedule(user: AuthenticatedConstructionUser, dto: UpsertScheduleDto): Promise<unknown>;
  listSchedules(user: AuthenticatedConstructionUser, query: ListConstructionDto): Promise<unknown>;
}
