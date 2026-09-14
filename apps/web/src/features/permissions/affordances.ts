import type { RuntimePermission } from "../workbench/management-menu";
import { hasEffectivePermission } from "./use-effective-permissions";

export type AffordanceKind = "menu" | "shortcut" | "page" | "action";

export type AffordanceDefinition = {
  id: string;
  kind: AffordanceKind;
  requirements: ReadonlyArray<{ code: string; action: string }>;
};

/**
 * The UI permission directory names the user-visible capability once. Pages,
 * buttons and future menu/shortcut adapters can consume the same definition;
 * the API remains the final authorization boundary.
 */
export const AFFORDANCE_DEFINITIONS = {
  customerView: { id: "customers.view", kind: "page", requirements: [{ code: "customers", action: "read" }] },
  customerCreate: { id: "customers.create", kind: "action", requirements: [{ code: "customers", action: "write" }] },
  customerEdit: { id: "customers.edit", kind: "action", requirements: [{ code: "customers", action: "write" }] },
  customerArchive: { id: "customers.archive", kind: "action", requirements: [{ code: "customers", action: "archive" }] },
  customerRestore: { id: "customers.restore", kind: "action", requirements: [{ code: "customers", action: "restore" }] },
  customerVehicleEdit: { id: "customers.vehicles.edit", kind: "action", requirements: [{ code: "customers", action: "write" }] },
  customerVehicleLifecycle: { id: "customers.vehicles.lifecycle", kind: "action", requirements: [{ code: "store", action: "write" }] },
  productView: { id: "products.view", kind: "page", requirements: [{ code: "products", action: "read" }] },
  productEdit: { id: "products.edit", kind: "action", requirements: [{ code: "products", action: "write" }] },
  productSuggestedPrice: { id: "products.suggested-price", kind: "action", requirements: [{ code: "products", action: "suggested-price-write" }] },
  productMaterialCost: { id: "products.material-cost", kind: "action", requirements: [{ code: "finance.cost", action: "write" }] },
  productDisable: { id: "products.disable", kind: "action", requirements: [{ code: "products", action: "disable" }] },
  productEnable: { id: "products.enable", kind: "action", requirements: [{ code: "products", action: "enable" }] }
} as const satisfies Record<string, AffordanceDefinition>;

export function hasAffordancePermission(
  permissions: RuntimePermission[] | undefined,
  definition: AffordanceDefinition,
  storeId?: string
) {
  return definition.requirements.some((requirement) =>
    hasEffectivePermission(permissions, requirement.code, requirement.action, storeId)
  );
}
