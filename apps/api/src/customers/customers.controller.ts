/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { MulterFile } from "../users/multer-file.type";
import { OssService } from "../users/oss.service";
import { CustomersService, type AuthenticatedCustomerUser } from "./customers.service";
import { CreateCustomerNoteDto } from "./dto/create-customer-note.dto";
import { CreateCustomerTagDto } from "./dto/create-customer-tag.dto";
import { CreateCustomerUserForCustomerDto } from "./dto/create-customer-user.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";
import {
  ChangeVehicleStatusDto,
  ListCustomerVehiclesDto,
  TransferVehicleDto
} from "./dto/vehicle-lifecycle.dto";

type AuthRequest = Request & {
  user: AuthenticatedCustomerUser;
};

@UseGuards(JwtAuthGuard)
@Controller("customers")
export class CustomersController {
  constructor(
    @Inject(CustomersService) private readonly customers: CustomersService,
    @Inject(OssService) private readonly ossService: OssService
  ) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerDto) {
    return this.customers.create(req.user, dto.storeId, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomersDto) {
    return this.customers.list(req.user, query);
  }

  @Get("search")
  search(@Req() req: AuthRequest, @Query("storeId") storeId: string, @Query("q") q = "") {
    return this.customers.search(req.user, storeId, q);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.customers.detail(req.user, id);
  }

  @Get(":id/order-context")
  orderContext(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query("vehicleId") vehicleId?: string
  ) {
    return this.customers.orderContext(req.user, id, vehicleId);
  }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(req.user, id, dto);
  }

  @Post("vehicles")
  createVehicle(@Req() req: AuthRequest, @Body() dto: CreateVehicleDto) {
    return this.customers.createVehicle(req.user, dto);
  }

  @Get(":id/vehicles")
  listVehicles(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Query() query: ListCustomerVehiclesDto
  ) {
    return this.customers.listVehicles(req.user, id, query);
  }

  @Post("vehicles/photos/upload")
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
  async uploadVehiclePhoto(@Req() req: AuthRequest, @UploadedFile() file: MulterFile) {
    if (!file) {
      throw new BadRequestException("请上传图片文件");
    }
    const url = await this.ossService.uploadVehiclePhoto(req.user.id, file);
    return { url };
  }

  @Post("users")
  createCustomerUser(@Req() req: AuthRequest, @Body() dto: CreateCustomerUserForCustomerDto) {
    return this.customers.createCustomerUser(req.user, dto);
  }

  @Patch("vehicles/:id")
  updateVehicle(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateVehicleDto) {
    return this.customers.updateVehicle(req.user, id, dto);
  }

  @Post("vehicles/:id/disable")
  disableVehicle(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ChangeVehicleStatusDto) {
    return this.customers.changeVehicleStatus(req.user, id, "INACTIVE", dto);
  }

  @Post("vehicles/:id/enable")
  enableVehicle(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ChangeVehicleStatusDto) {
    return this.customers.changeVehicleStatus(req.user, id, "ACTIVE", dto);
  }

  @Post("vehicles/:id/transfer")
  transferVehicle(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: TransferVehicleDto) {
    return this.customers.transferVehicle(req.user, id, dto);
  }

  @Get("vehicles/:id/history")
  vehicleHistory(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.customers.vehicleHistory(req.user, id);
  }

  @Post("notes")
  createNote(@Req() req: AuthRequest, @Body() dto: CreateCustomerNoteDto) {
    return this.customers.createNote(req.user, dto);
  }

  @Post("tags")
  createTag(@Req() req: AuthRequest, @Body() dto: CreateCustomerTagDto) {
    return this.customers.createTag(req.user, dto);
  }

  @Delete("tags/:id")
  deleteTag(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.customers.deleteTag(req.user, id);
  }
}
