import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { MulterFile } from "../users/multer-file.type";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Public } from "../auth/decorators/public.decorator";
import { OssService } from "../users/oss.service";
import { CreateStoreDto } from "./dto/create-store.dto";
import { SubmitStoreDto } from "./dto/submit-store.dto";
import { ReviewStoreDto } from "./dto/review-store.dto";
import { ListStoresDto } from "./dto/list-stores.dto";
import { ChangeManagerDto } from "./dto/change-manager.dto";
import { StoresService } from "./stores.service";

type AuthRequest = Request & {
  user: { id: string; username: string; isAuditor: boolean };
};

@UseGuards(JwtAuthGuard)
@Controller("stores")
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly ossService: OssService
  ) {}

  // 审核员：创建门店并指派店长
  @Post()
  createStore(@Req() req: AuthRequest, @Body() dto: CreateStoreDto) {
    return this.storesService.createStore(req.user.id, req.user.isAuditor, dto);
  }

  // 公开门店列表（无需登录也可访问）
  @Public()
  @Get()
  listStores(@Query() query: ListStoresDto) {
    return this.storesService.listPublishedStores(query);
  }

  // 店长：工作台门店详情（含成员列表）
  @Get("workbench/:id")
  getWorkbenchStore(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.storesService.getWorkbenchStore(req.user.id, id);
  }

  // 审核员：全量门店列表（含所有状态）
  @Get("admin/all")
  listAllStores(@Req() req: AuthRequest, @Query() query: ListStoresDto) {
    return this.storesService.listAllStores(req.user.isAuditor, query);
  }

  // 审核员：待审核提交列表
  @Get("admin/pending-submissions")
  listPendingSubmissions(@Req() req: AuthRequest) {
    return this.storesService.listPendingSubmissions(req.user.isAuditor);
  }

  // 审核员：门店详情（含待审核提交）
  @Get("admin/:id")
  getAdminStore(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.storesService.getAdminStoreDetail(req.user.isAuditor, id);
  }

  // 门店详情（公开，无需登录）
  @Public()
  @Get(":id")
  getStore(@Param("id") id: string) {
    return this.storesService.getStoreDetail(id);
  }

  // 店长：上传门店照片到 OSS，返回 URL
  @Post(":id/photos/upload")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter(_req, file, cb) {
        if (!file.mimetype.startsWith("image/")) {
          return cb(new BadRequestException("只允许上传图片"), false);
        }
        cb(null, true);
      }
    })
  )
  async uploadStorePhoto(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @UploadedFile() file: MulterFile
  ) {
    if (!file) throw new BadRequestException("请上传图片文件");
    await this.storesService.assertStoreManager(req.user.id, id);
    const url = await this.ossService.uploadStorePhoto(id, file);
    return { url };
  }

  // 店长：提交门店信息送审
  @Post(":id/submit")
  submitStore(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: SubmitStoreDto) {
    return this.storesService.submitStore(req.user.id, id, dto);
  }

  // 审核员：审核门店提交
  @Post("submissions/:submissionId/review")
  reviewSubmission(
    @Req() req: AuthRequest,
    @Param("submissionId") submissionId: string,
    @Body() dto: ReviewStoreDto
  ) {
    return this.storesService.reviewSubmission(req.user.id, req.user.isAuditor, submissionId, dto);
  }

  // 审核员：冻结门店
  @Patch(":id/freeze")
  freezeStore(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.storesService.setFrozen(req.user.isAuditor, id, true);
  }

  // 审核员：解冻门店
  @Patch(":id/unfreeze")
  unfreezeStore(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.storesService.setFrozen(req.user.isAuditor, id, false);
  }

  // 审核员：变更店长
  @Patch(":id/manager")
  changeManager(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ChangeManagerDto
  ) {
    return this.storesService.changeManager(req.user.isAuditor, id, dto);
  }
}
