import test from "node:test";
import assert from "node:assert/strict";
import { capabilityStatus, groupCapabilities } from "./workbench-model";
const item = (domain: "HQ" | "STORE" | "FINANCE" | "OWN", code = domain) => ({ code, name: code, domain, actions: ["view"], scope: domain === "OWN" ? "own" as const : domain === "HQ" ? "global" as const : "store" as const, allowed: true, scopeId: "scope" });
test("groups only visible capabilities and preserve domain order", () => { const groups = groupCapabilities([item("FINANCE"), item("STORE")]); assert.deepEqual(groups.map((group) => group.domain), ["STORE", "FINANCE"]); });
test("planned capability is not normal", () => { assert.equal(capabilityStatus({ ...item("STORE"), planned: true }).label, "规划中"); assert.equal(capabilityStatus(item("STORE")).label, "只读"); });