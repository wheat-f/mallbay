import type { CreateConfigVersionDto, UpdateConfigVersionDto } from "../dto/config-version.dto";
import type { ConfigVersionsService } from "../config-versions.service";
import type { SettingsUser } from "../settings-access.service";

export const CONFIGURATION_VERSION_GOVERNANCE = Symbol("CONFIGURATION_VERSION_GOVERNANCE");

export type ConfigurationVersionGovernance = Pick<ConfigVersionsService,
  "expireStaleDrafts" | "list" | "create" | "update" | "validate" | "clone" | "publish" | "withdraw"
> & {
  list(user: SettingsUser, capabilityCode?: string, scopeId?: string, page?: number, pageSize?: number): ReturnType<ConfigVersionsService["list"]>;
  create(user: SettingsUser, dto: CreateConfigVersionDto): ReturnType<ConfigVersionsService["create"]>;
  update(user: SettingsUser, id: string, dto: UpdateConfigVersionDto): ReturnType<ConfigVersionsService["update"]>;
};
