import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  ApprovePurchaseReturnDto,
  ApproveSalesReturnDto,
  CancelReturnDto,
  CostVerificationConfirmDto, CostVerificationResubmitDto, CostVerificationSubmitDto, CreatePurchaseReturnDto,
  CreateSalesReturnDto,
  InspectionApproveDto, InspectionConvertDto, ReceiveSalesReturnDto,
  RefundSalesReturnDto,
  ReturnActionDto,
  SettlePurchaseReturnDto,
} from "./dto/returns.dto";
import { ReturnsWorkflow, type ReturnUser } from "./returns.service";

type AuthRequest = Request & { user: ReturnUser };

@UseGuards(JwtAuthGuard)
@Controller()
export class ReturnsController {
  constructor(private readonly returns: ReturnsWorkflow) {}

  @Get("sales-returns") listSales(@Req() req: AuthRequest, @Query("storeId") storeId: string) { return this.returns.listSales(req.user, storeId); }
  @Get("sales-returns/:id") detailSales(@Req() req: AuthRequest, @Param("id") id: string) { return this.returns.detailSales(req.user, id); }
  @Post("sales-returns") createSales(@Req() req: AuthRequest, @Body() dto: CreateSalesReturnDto) { return this.returns.execute({ action: "CREATE_SALES", user: req.user, dto }); }
  @Post("sales-returns/:id/submit") submitSales(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReturnActionDto) { return this.returns.execute({ action: "SUBMIT_SALES", user: req.user, id, dto }); }
  @Post("sales-returns/:id/approve") approveSales(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ApproveSalesReturnDto) { return this.returns.execute({ action: "APPROVE_SALES", user: req.user, id, dto }); }
  @Post("sales-returns/:id/receive") receiveSales(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReceiveSalesReturnDto) { return this.returns.execute({ action: "RECEIVE_SALES", user: req.user, id, dto }); }
  @Post("sales-returns/:id/inspection/approve") inspectionApprove(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: InspectionApproveDto) { return this.returns.execute({ action: "APPROVE_INSPECTION", user: req.user, id, dto }); }
  @Post("sales-returns/:id/inspection/convert") inspectionConvert(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: InspectionConvertDto) { return this.returns.execute({ action: "CONVERT_INSPECTION", user: req.user, id, dto }); }
  @Post("sales-returns/:id/cost-verification/submit") costSubmit(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CostVerificationSubmitDto) { return this.returns.execute({ action: "SUBMIT_COST_VERIFICATION", user: req.user, id, dto }); }
  @Post("sales-returns/:id/cost-verification/confirm") costConfirm(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CostVerificationConfirmDto) { return this.returns.execute({ action: "CONFIRM_COST_VERIFICATION", user: req.user, id, dto }); }
  @Post("sales-returns/:id/cost-verification/resubmit") costResubmit(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CostVerificationResubmitDto) { return this.returns.execute({ action: "RESUBMIT_COST_VERIFICATION", user: req.user, id, dto }); }
  @Post("sales-returns/:id/refund") refundSales(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RefundSalesReturnDto) { return this.returns.execute({ action: "REFUND_SALES", user: req.user, id, dto }); }
  @Post("sales-returns/:id/cancel") cancelSales(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CancelReturnDto) { return this.returns.execute({ action: "CANCEL_SALES", user: req.user, id, dto }); }

  @Get("purchase-returns") listPurchase(@Req() req: AuthRequest, @Query("storeId") storeId: string) { return this.returns.listPurchase(req.user, storeId); }
  @Get("purchase-returns/:id") detailPurchase(@Req() req: AuthRequest, @Param("id") id: string) { return this.returns.detailPurchase(req.user, id); }
  @Post("purchase-returns") createPurchase(@Req() req: AuthRequest, @Body() dto: CreatePurchaseReturnDto) { return this.returns.execute({ action: "CREATE_PURCHASE", user: req.user, dto }); }
  @Post("purchase-returns/:id/submit") submitPurchase(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReturnActionDto) { return this.returns.execute({ action: "SUBMIT_PURCHASE", user: req.user, id, dto }); }
  @Post("purchase-returns/:id/approve") approvePurchase(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ApprovePurchaseReturnDto) { return this.returns.execute({ action: "APPROVE_PURCHASE", user: req.user, id, dto }); }
  @Post("purchase-returns/:id/outbound") outboundPurchase(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: { detailId: string; quantity: number; idempotencyKey: string }) { return this.returns.execute({ action: "OUTBOUND_PURCHASE", user: req.user, id, detailId: body.detailId, quantity: body.quantity, dto: body }); }
  @Post("purchase-returns/:id/settle") settlePurchase(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: SettlePurchaseReturnDto) { return this.returns.execute({ action: "SETTLE_PURCHASE", user: req.user, id, dto }); }
  @Post("purchase-returns/:id/settlement/reverse") reverseSettlement(@Req() req: AuthRequest, @Param("id") id: string, @Body() body: ReturnActionDto & { settlementAdjustmentId: string }) { return this.returns.execute({ action: "REVERSE_SETTLEMENT", user: req.user, id, adjustmentId: body.settlementAdjustmentId, dto: body }); }
  @Post("purchase-returns/:id/cancel") cancelPurchase(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CancelReturnDto) { return this.returns.execute({ action: "CANCEL_PURCHASE", user: req.user, id, dto }); }
}
