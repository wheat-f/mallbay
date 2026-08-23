import type { DictionaryGovernanceService } from "../dictionary-governance.service";

export const DICTIONARY_GOVERNANCE = Symbol("DICTIONARY_GOVERNANCE");
export type DictionaryGovernance = DictionaryGovernanceService;
