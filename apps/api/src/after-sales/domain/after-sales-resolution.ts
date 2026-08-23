import type { AuthenticatedAfterSalesUser } from "../after-sales.service";
import type { AssignAfterSaleDto, CreateAfterSaleCostDto, CreateAfterSaleDto, JudgeAfterSaleDto, ListAfterSalesDto, ReverseAfterSaleCostDto, SubmitAfterSaleEvidenceDto, UploadAfterSalePhotoDto } from "../dto/after-sales.dto";
import type { MulterFile } from "../../users/multer-file.type";

export const AFTER_SALES_RESOLUTION = Symbol("AFTER_SALES_RESOLUTION");
export const AFTER_SALES_READ_MODEL = Symbol("AFTER_SALES_READ_MODEL");

export interface AfterSalesReadModel {
  list(user: AuthenticatedAfterSalesUser, query: ListAfterSalesDto): Promise<unknown>;
  detail(user: AuthenticatedAfterSalesUser, id: string): Promise<unknown>;
}

export interface AfterSalesResolution {
  create(user: AuthenticatedAfterSalesUser, dto: CreateAfterSaleDto): Promise<unknown>;
  assign(user: AuthenticatedAfterSalesUser, id: string, dto: AssignAfterSaleDto): Promise<unknown>;
  judgeResponsibility(user: AuthenticatedAfterSalesUser, id: string, dto: JudgeAfterSaleDto): Promise<unknown>;
  submitEvidence(user: AuthenticatedAfterSalesUser, id: string, dto: SubmitAfterSaleEvidenceDto): Promise<unknown>;
  uploadPhoto(user: AuthenticatedAfterSalesUser, id: string, dto: UploadAfterSalePhotoDto, file?: MulterFile): Promise<unknown>;
  close(user: AuthenticatedAfterSalesUser, id: string): Promise<unknown>;
  addCost(user: AuthenticatedAfterSalesUser, afterSaleId: string, dto: CreateAfterSaleCostDto): Promise<unknown>;
  reverseCost(user: AuthenticatedAfterSalesUser, afterSaleId: string, costId: string, dto: ReverseAfterSaleCostDto): Promise<unknown>;
}
