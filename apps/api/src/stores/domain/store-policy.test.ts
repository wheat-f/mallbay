import assert from "node:assert/strict";
import { test } from "node:test";
import { BadRequestException } from "@nestjs/common";
import { StoreStatus } from "@prisma/client";
import { StorePolicy } from "./store-policy";
import { ReviewAction } from "../dto/review-store.dto";

test("StorePolicy rejects submission when store is frozen", () => {
  assert.throws(
    () => StorePolicy.assertCanSubmit(StoreStatus.FROZEN),
    (error) => error instanceof BadRequestException && error.message === "门店已冻结，无法提交"
  );
});

test("StorePolicy normalizes submission photos with a default cover", () => {
  const photos = [
    { url: "https://example.com/1.jpg" },
    { url: "https://example.com/2.jpg", order: 7 }
  ];

  const normalized = StorePolicy.normalizeSubmissionPhotos(photos);

  assert.deepEqual(normalized, [
    { url: "https://example.com/1.jpg", isCover: true, order: 0 },
    { url: "https://example.com/2.jpg", isCover: false, order: 7 }
  ]);
  assert.equal(photos[0].isCover, undefined);
});

test("StorePolicy rejects invalid submission photo counts and multiple covers", () => {
  assert.throws(
    () => StorePolicy.normalizeSubmissionPhotos([]),
    (error) => error instanceof BadRequestException && error.message === "门店照片数量需在 1~5 张之间"
  );

  assert.throws(
    () =>
      StorePolicy.normalizeSubmissionPhotos([
        { url: "https://example.com/1.jpg", isCover: true },
        { url: "https://example.com/2.jpg", isCover: true }
      ]),
    (error) => error instanceof BadRequestException && error.message === "只能选择一张封面"
  );
});

test("StorePolicy requires reject review note", () => {
  assert.throws(
    () => StorePolicy.assertReviewInput(ReviewAction.REJECT, "   "),
    (error) => error instanceof BadRequestException && error.message === "驳回时必须填写原因"
  );

  assert.doesNotThrow(() => StorePolicy.assertReviewInput(ReviewAction.APPROVE));
});

test("StorePolicy restores status after rejected submission", () => {
  assert.equal(StorePolicy.statusAfterRejectedSubmission(true), StoreStatus.PUBLISHED);
  assert.equal(StorePolicy.statusAfterRejectedSubmission(false), StoreStatus.DRAFTED);
});
