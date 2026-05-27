import { BadRequestException } from "@nestjs/common";
import { StoreStatus } from "@prisma/client";
import { ReviewAction } from "../dto/review-store.dto";
import { SubmitPhotoDto } from "../dto/submit-store.dto";

export type NormalizedSubmissionPhoto = {
  url: string;
  isCover: boolean;
  order: number;
};

export class StorePolicy {
  static assertCanSubmit(status: StoreStatus) {
    if (status === StoreStatus.FROZEN) {
      throw new BadRequestException("门店已冻结，无法提交");
    }
  }

  static normalizeSubmissionPhotos(photos: SubmitPhotoDto[]): NormalizedSubmissionPhoto[] {
    if (photos.length < 1 || photos.length > 5) {
      throw new BadRequestException("门店照片数量需在 1~5 张之间");
    }

    const coverCount = photos.filter((p) => p.isCover).length;
    if (coverCount > 1) {
      throw new BadRequestException("只能选择一张封面");
    }

    return photos.map((photo, index) => ({
      url: photo.url,
      isCover: coverCount === 0 ? index === 0 : photo.isCover ?? false,
      order: photo.order ?? index
    }));
  }

  static assertReviewInput(action: ReviewAction, reviewNote?: string) {
    if (action === ReviewAction.REJECT && !reviewNote?.trim()) {
      throw new BadRequestException("驳回时必须填写原因");
    }
  }

  static statusAfterRejectedSubmission(hasApprovedSubmission: boolean) {
    return hasApprovedSubmission ? StoreStatus.PUBLISHED : StoreStatus.DRAFTED;
  }
}
