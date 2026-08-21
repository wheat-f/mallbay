import { StorePosition } from "@prisma/client";

export type UserWithStoreMember = {
  id: string;
  /** @deprecated Permission meaning is resolved by AccessContext. */
  isAuditor?: boolean;
  /** @deprecated Membership is business data, not an authorization input. */
  storeMember?: {
    storeId: string;
    position: StorePosition;
  } | null;
};

export type CustomerScope =
  | { all: true }
  | { storeId: string }
  | { storeId: string; ownerUserId: string };

export type OrderScope =
  | { all: true }
  | { storeId: string }
  | { storeId: string; salesPersonId: string }
  | { storeId: string; assignedWorkerId: string };
