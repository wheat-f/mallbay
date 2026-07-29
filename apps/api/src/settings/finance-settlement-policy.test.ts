import assert from "node:assert/strict";
import test from "node:test";
import { BadRequestException } from "@nestjs/common";
import { DEFAULT_FINANCE_SETTLEMENT_POLICY, loadPublishedFinanceSettlementPolicy, parseFinanceSettlementPolicy, validateFinanceSettlementPolicy } from "./finance-settlement-policy";

test("财务结算策略要求显式声明现行核算口径", () => {
  assert.deepEqual(validateFinanceSettlementPolicy(DEFAULT_FINANCE_SETTLEMENT_POLICY), {});
  assert.throws(() => parseFinanceSettlementPolicy({}), BadRequestException);
});

test("已发布策略按门店读取，缺失时拒绝真实运行", async () => {
  const policy = await loadPublishedFinanceSettlementPolicy({ settingsConfigVersion: { findFirst: async () => ({ payload: DEFAULT_FINANCE_SETTLEMENT_POLICY }) } }, "store-1");
  assert.equal(policy.missingCostPolicy, "BLOCK_CONFIRMATION");
  await assert.rejects(() => loadPublishedFinanceSettlementPolicy({ settingsConfigVersion: { findFirst: async () => null } }, "store-1"), BadRequestException);
});