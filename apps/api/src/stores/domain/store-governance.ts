import type { ChangeManagerDto } from "../dto/change-manager.dto";
import type { CreateFinancialEntityDto, UpdateStoreCrossStoreConfigDto } from "../dto/cross-store-config.dto";
import type { CreateStoreDto } from "../dto/create-store.dto";
import type { ListStoresDto } from "../dto/list-stores.dto";
import type { ReviewStoreDto } from "../dto/review-store.dto";
import type { SubmitStoreDto } from "../dto/submit-store.dto";

export const STORE_GOVERNANCE = Symbol("STORE_GOVERNANCE");

export type StoreGovernance = {
  createStore(actorId: string, dto: CreateStoreDto): Promise<unknown>;
  submitStore(userId: string, storeId: string, dto: SubmitStoreDto): Promise<unknown>;
  reviewSubmission(actorId: string, submissionId: string, dto: ReviewStoreDto): Promise<unknown>;
  listEligibleExecutionStores(actorId: string, sourceStoreId: string): Promise<unknown>;
  listPublishedStores(dto: ListStoresDto): Promise<unknown>;
  listAllStores(actorId: string, dto: ListStoresDto): Promise<unknown>;
  listFinancialEntities(actorId: string): Promise<unknown>;
  createFinancialEntity(actorId: string, dto: CreateFinancialEntityDto): Promise<unknown>;
  updateCrossStoreConfig(actorId: string, storeId: string, dto: UpdateStoreCrossStoreConfigDto): Promise<unknown>;
  listPendingSubmissions(actorId: string): Promise<unknown>;
  getStoreDetail(storeId: string): Promise<unknown>;
  getWorkbenchStore(userId: string, storeId: string): Promise<unknown>;
  getAdminStoreDetail(actorId: string, storeId: string): Promise<unknown>;
  setFrozen(actorId: string, storeId: string, frozen: boolean): Promise<unknown>;
  changeManager(actorId: string, storeId: string, dto: ChangeManagerDto): Promise<unknown>;
  assertStoreManager(userId: string, storeId: string): Promise<unknown>;
};
