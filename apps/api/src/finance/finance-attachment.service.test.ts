import assert from "node:assert/strict";
import { test } from "node:test";
import { FinanceAttachmentCategory } from "@prisma/client";
import { FinanceAttachmentService } from "./finance-attachment.service";

const file = {
  originalname: "receipt.pdf",
  mimetype: "application/pdf",
  size: 12,
  buffer: Buffer.from("receipt")
};

function makeService(allowed: (actorId: string, context: { storeId?: string; ownerId?: string }) => boolean) {
  const created: unknown[] = [];
  const prisma = {
    expenseApplication: {
      findUnique: async () => ({ id: "expense-1", storeId: "store-1", applicantId: "user-1" })
    },
    financeAttachment: {
      create: async (args: unknown) => { created.push(args); return { id: "attachment-1", ...args as object }; }
    },
    storeMember: { findUnique: async () => ({ storeId: "store-1", position: "FINANCE" }) }
  };
  const service = new FinanceAttachmentService(
    prisma as never,
    { uploadFinanceAttachment: async () => "https://files.test/receipt.pdf" } as never,
    { can: async (actor: { userId: string }, _capability: string, _action: string, context: { storeId?: string; ownerId?: string }) => allowed(actor.userId, context) } as never
  );
  return { service, created };
}

test("FinanceAttachmentService allows the applicant to upload an attachment", async () => {
  const { service, created } = makeService((actorId, context) => actorId === context.ownerId);
  const result = await service.upload(
    { id: "user-1", isAuditor: false } as never,
    "EXPENSE",
    "expense-1",
    { category: FinanceAttachmentCategory.RECEIPT } as never,
    file as never
  );
  assert.equal(result.id, "attachment-1");
  assert.equal(created.length, 1);
});

test("FinanceAttachmentService allows a finance user to upload for the store", async () => {
  const { service } = makeService((actorId, context) => actorId === "finance-1" && !context.ownerId);
  const result = await service.upload(
    { id: "finance-1", isAuditor: false } as never,
    "EXPENSE",
    "expense-1",
    { category: FinanceAttachmentCategory.RECEIPT } as never,
    file as never
  );
  assert.equal(result.id, "attachment-1");
});

test("FinanceAttachmentService rejects an unrelated actor", async () => {
  const { service } = makeService(() => false);
  await assert.rejects(
    () => service.upload(
      { id: "other-1", isAuditor: false } as never,
      "EXPENSE",
      "expense-1",
      { category: FinanceAttachmentCategory.RECEIPT } as never,
      file as never
    ),
    /无权限/
  );
});
