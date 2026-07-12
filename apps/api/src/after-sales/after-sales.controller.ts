/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { FileInterceptor } from "@nestjs/platform-express";
import type { MulterFile } from "../users/multer-file.type";
import { AfterSalesService, type AuthenticatedAfterSalesUser } from "./after-sales.service";
import { AssignAfterSaleDto, CreateAfterSaleDto, JudgeAfterSaleDto, ListAfterSalesDto, SubmitAfterSaleEvidenceDto, UploadAfterSalePhotoDto } from "./dto/after-sales.dto";

type AuthRequest = Request & {
  user: AuthenticatedAfterSalesUser;
};

@UseGuards(JwtAuthGuard)
@Controller("after-sales")
export class AfterSalesController {
  constructor(private readonly afterSales: AfterSalesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListAfterSalesDto) {
    return this.afterSales.list(req.user, query);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.afterSales.detail(req.user, id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateAfterSaleDto) {
    return this.afterSales.create(req.user, dto);
  }

  @Post(":id/assign")
  assign(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: AssignAfterSaleDto) {
    return this.afterSales.assign(req.user, id, dto);
  }

  @Post(":id/responsibility")
  judge(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: JudgeAfterSaleDto) {
    return this.afterSales.judgeResponsibility(req.user, id, dto);
  }

  @Post(":id/evidence")
  submitEvidence(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: SubmitAfterSaleEvidenceDto) {
    return this.afterSales.submitEvidence(req.user, id, dto);
  }

  @Post(":id/photos")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter(_req, file, cb) {
        if (!file.mimetype.startsWith("image/")) return cb(new BadRequestException("只允许上传图片"), false);
        cb(null, true);
      }
    })
  )
  uploadPhoto(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: UploadAfterSalePhotoDto,
    @UploadedFile() file?: MulterFile
  ) {
    return this.afterSales.uploadPhoto(req.user, id, dto, file);
  }

  @Post(":id/close")
  close(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.afterSales.close(req.user, id);
  }
}
