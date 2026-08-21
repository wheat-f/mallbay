/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { CustomerNoteType, Gender, OrderStatus, Prisma, SettingsConfigStatus } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { normalizePagination } from "../common/pagination";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
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

export const SENSITIVE_FIELD_CODEC = Symbol("SENSITIVE_FIELD_CODEC");

export type SensitiveFieldCodec = {
  encrypt(value: string): string;
  hash(value: string): string;
};

export type AuthenticatedCustomerUser = {
  id: string;
  username?: string;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  isAuditor?: boolean;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  storeMember?: { storeId: string; position: string } | null;
};

@Injectable()
export class CustomersService {
  private readonly codec: SensitiveFieldCodec;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(SENSITIVE_FIELD_CODEC)
    codec?: SensitiveFieldCodec,
    @Optional() private readonly accessContext?: AccessContext
  ) {
    this.codec = codec ?? createDefaultSensitiveFieldCodec();
  }

  async create(user: AuthenticatedCustomerUser, storeId: string, dto: CreateCustomerDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canCustomer(actor, "write", storeId, actor.userId)) {
      throw new ForbiddenException("无权限");
    }
    this.assertValidCreatePayload(dto);

    const phoneHash = this.codec.hash(dto.phone);
    const existing = await this.prisma.customer.findUnique({
      where: { storeId_phoneHash: { storeId, phoneHash } }
    });
    if (existing) {
      throw new ConflictException("客户手机号已存在");
    }

    const companyUsers = dto.customerType === "COMPANY" ? this.normalizeCompanyUsers(dto.companyUsers) : [];
    const customer = await this.prisma.customer.create({
      data: {
        storeId,
        ownerUserId: actor.userId,
        customerType: dto.customerType,
        name: dto.name,
        gender: dto.gender ?? Gender.UNKNOWN,
        birthday: this.normalizeOptionalDate(dto.birthday),
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        phoneEncrypted: this.codec.encrypt(dto.phone),
        phoneHash,
        wechat: dto.wechat,
        sourceType: dto.sourceType,
        sourceDetail: dto.sourceDetail,
        referrerId: dto.referrerId,
        users: companyUsers.length > 0 ? {
          create: companyUsers.map((companyUser) => this.toCustomerUserCreateData(companyUser))
        } : undefined
      },
      include: { users: true }
    });
    return this.sanitizeCustomer(customer);
  }

  async list(user: AuthenticatedCustomerUser, dto: ListCustomersDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canCustomer(actor, "read", dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);
    const where = await this.buildScopedWhere(actor, dto.storeId);
    const q = dto.q?.trim();
    if (q) {
      where.OR = this.buildSearchConditions(q);
    }

    if (dto.systemTag || dto.customTagId) {
      const allItems = await this.prisma.customer.findMany({ where, orderBy: { updatedAt: "desc" }, include: { vehicles: { take: 3, orderBy: { updatedAt: "desc" } }, users: { take: 5, orderBy: { updatedAt: "desc" } }, tags: { orderBy: { createdAt: "desc" } }, owner: { select: { id: true, username: true, nickname: true } } } });
      const thresholds = await this.getTagThresholds();
      const decoratedItems = (await Promise.all(allItems.map((customer) => this.decorateCustomer(customer, dto.systemTag, dto.customTagId, thresholds)))).filter((item): item is NonNullable<typeof item> => item !== null);
      return { total: decoratedItems.length, page, pageSize, items: await this.attachListConsumptionSummaries(decoratedItems.slice(skip, skip + pageSize)) };
    }
    const thresholds = await this.getTagThresholds();
    const [total, items] = await Promise.all([
      this.prisma.customer.count({ where }),
      this.prisma.customer.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
          vehicles: { take: 3, orderBy: { updatedAt: "desc" } },
          users: { take: 5, orderBy: { updatedAt: "desc" } },
          tags: { orderBy: { createdAt: "desc" } },
          owner: { select: { id: true, username: true, nickname: true } }
        }
      })
    ]);

    const decoratedItems = (await Promise.all(items.map((customer) => this.decorateCustomer(customer, dto.systemTag, dto.customTagId, thresholds)))).filter((item): item is NonNullable<typeof item> => item !== null);
    return {
      total,
      page,
      pageSize,
      items: await this.attachListConsumptionSummaries(decoratedItems)
    };
  }

  async search(user: AuthenticatedCustomerUser, storeId: string, q: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.canCustomer(actor, "read", storeId)) {
      throw new ForbiddenException("无权限");
    }

    const where = await this.buildScopedWhere(actor, storeId);
    const keyword = q?.trim();
    if (keyword) {
      where.OR = this.buildSearchConditions(keyword);
    }

    const customers = await this.prisma.customer.findMany({
      where,
      take: 20,
      orderBy: { updatedAt: "desc" },
      include: {
        vehicles: { take: 2, orderBy: { updatedAt: "desc" } },
        users: { take: 5, orderBy: { updatedAt: "desc" } }
      }
    });

    return Promise.all(customers.map((customer) => this.decorateCustomer(customer)));
  }

  async detail(user: AuthenticatedCustomerUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        vehicles: { orderBy: { updatedAt: "desc" } },
        users: { orderBy: { updatedAt: "desc" } },
        notes: { orderBy: { createdAt: "desc" } },
        tags: { orderBy: { createdAt: "desc" } },
        referrer: { select: { id: true, name: true, companyName: true, contactPerson: true } },
        owner: { select: { id: true, username: true, nickname: true } },
        orders: {
          orderBy: { createdAt: "desc" },
          take: 10,
          include: {
            amount: true,
            vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } }
          }
        },
        warranties: { orderBy: { endDate: "desc" } },
        afterSales: { orderBy: { createdAt: "desc" } }
      }
    });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!await this.canCustomer(actor, "read", customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }

    const [orderStats, amountStats, constructionTypeStats, consumptionTrendOrders, recentConstructionRecords] = await Promise.all([
      this.prisma.order.aggregate({
        where: { customerId: id, status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true }
      }),
      this.prisma.orderAmount.aggregate({
        // Keep the amount projection on the same order fact set as the
        // count, distribution and trend projections above: in-transit
        // orders are included, cancelled orders are not.
        where: { order: { customerId: id, status: { not: OrderStatus.CANCELLED } } },
        _sum: {
          totalAmountCents: true,
          paidAmountCents: true,
          outstandingCents: true
        }
      }),
      this.prisma.order.groupBy({
        by: ["constructionType"],
        where: { customerId: id, status: { not: OrderStatus.CANCELLED } },
        _count: { _all: true }
      }),
      this.prisma.order.findMany({
        where: { customerId: id, status: { not: OrderStatus.CANCELLED } },
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          amount: {
            select: {
              totalAmountCents: true,
              paidAmountCents: true,
              outstandingCents: true
            }
          }
        }
      }),
      this.prisma.constructionRecord.findMany({
        where: { order: { customerId: id } },
        orderBy: { completedAt: "desc" },
        take: 3,
        select: {
          status: true,
          completedAt: true,
          actualMinutes: true,
          qualityResult: true,
          order: {
            select: {
              orderNo: true,
              constructionType: true,
              vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
            }
          }
        }
      })
    ]);

    const decoratedCustomer = await this.decorateCustomer(customer);
    if (!decoratedCustomer) throw new NotFoundException("客户标签计算失败");
    return {
      ...decoratedCustomer,
      archiveSummary: {
        ...this.buildArchiveSummary(customer, orderStats, amountStats, constructionTypeStats, consumptionTrendOrders, recentConstructionRecords),
        systemTags: decoratedCustomer.systemTags
      }
    };
  }

  async orderContext(user: AuthenticatedCustomerUser, customerId: string, vehicleId?: string) {
    const customer = await this.assertCanViewCustomer(user, customerId);
    const vehicle = vehicleId
      ? await this.prisma.customerVehicle.findUnique({
          where: { id: vehicleId },
          select: {
            id: true,
            customerId: true,
            storeId: true,
            carPlate: true,
            carModel: true,
            carColor: true,
            vehicleTypeCode: true,
            status: true
          }
        })
      : null;
    if (vehicleId && !vehicle) {
      throw new NotFoundException("车辆不存在");
    }
    if (vehicle && (vehicle.customerId !== customerId || vehicle.storeId !== customer.storeId)) {
      throw new BadRequestException("车辆不属于当前客户");
    }

    const selectedOrderWhere: Prisma.OrderWhereInput = vehicle
      ? { customerId, vehicleId: vehicle.id }
      : { customerId };
    const [
      customerOrderCount,
      customerAmount,
      vehicleOrderCount,
      vehicleAmount,
      recentOrders,
      recentConstruction,
      activeWarrantyCount,
      openAfterSalesCount,
      vehicleCount
    ] = await Promise.all([
      this.prisma.order.count({ where: { customerId } }),
      this.prisma.orderAmount.aggregate({
        where: { order: { customerId } },
        _sum: { totalAmountCents: true, outstandingCents: true }
      }),
      this.prisma.order.count({ where: selectedOrderWhere }),
      this.prisma.orderAmount.aggregate({
        where: { order: selectedOrderWhere },
        _sum: { totalAmountCents: true, outstandingCents: true }
      }),
      this.prisma.order.findMany({
        where: selectedOrderWhere,
        take: 5,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          orderNo: true,
          status: true,
          constructionType: true,
          appointmentDate: true,
          amount: { select: { totalAmountCents: true, outstandingCents: true } }
        }
      }),
      vehicle
        ? this.prisma.constructionRecord.findFirst({
            where: { order: { customerId, vehicleId: vehicle.id } },
            orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
            select: {
              status: true,
              completedAt: true,
              actualMinutes: true,
              qualityResult: true,
              order: { select: { id: true, orderNo: true, constructionType: true } }
            }
          })
        : Promise.resolve(null),
      vehicle
        ? this.prisma.warranty.count({
            where: { order: { customerId, vehicleId: vehicle.id }, status: "ACTIVE" }
          })
        : Promise.resolve(0),
      vehicle
        ? this.prisma.afterSale.count({
            where: {
              order: { customerId, vehicleId: vehicle.id },
              status: { in: ["OPEN", "ASSIGNED"] }
            }
          })
        : Promise.resolve(0),
      this.prisma.customerVehicle.count({ where: { customerId } })
    ]);

    const unusableReason = vehicle
      ? vehicle.status !== "ACTIVE"
        ? "车辆已停用"
        : !vehicle.vehicleTypeCode
          ? "车辆类型待补齐"
          : null
      : null;

    return {
      customer: {
        id: customer.id,
        vehicleCount,
        orderCount: customerOrderCount,
        totalAmountCents: customerAmount._sum.totalAmountCents ?? 0,
        outstandingCents: customerAmount._sum.outstandingCents ?? 0
      },
      vehicle: vehicle
        ? {
            ...vehicle,
            usable: !unusableReason,
            unusableReason,
            orderCount: vehicleOrderCount,
            totalAmountCents: vehicleAmount._sum.totalAmountCents ?? 0,
            outstandingCents: vehicleAmount._sum.outstandingCents ?? 0,
            activeWarrantyCount,
            openAfterSalesCount,
            recentConstruction
          }
        : null,
      recentOrders
    };
  }

  async update(user: AuthenticatedCustomerUser, id: string, dto: UpdateCustomerDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!await this.canCustomer(actor, "write", customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }

    const data: Prisma.CustomerUpdateInput = {
      customerType: dto.customerType,
      name: dto.name,
      gender: dto.gender,
      birthday: this.normalizeOptionalDate(dto.birthday),
      companyName: dto.companyName,
      contactPerson: dto.contactPerson,
      wechat: dto.wechat,
      sourceType: dto.sourceType,
      sourceDetail: dto.sourceDetail,
      referrer: dto.referrerId === undefined
        ? undefined
        : dto.referrerId === null
          ? { disconnect: true }
          : { connect: { id: dto.referrerId } }
    };

    if (dto.phone) {
      const phoneHash = this.codec.hash(dto.phone);
      const duplicate = await this.prisma.customer.findUnique({
        where: { storeId_phoneHash: { storeId: customer.storeId, phoneHash } }
      });
      if (duplicate && duplicate.id !== id) {
        throw new ConflictException("客户手机号已存在");
      }
      data.phoneHash = phoneHash;
      data.phoneEncrypted = this.codec.encrypt(dto.phone);
    }

    const updated = await this.prisma.customer.update({
      where: { id },
      data
    });
    return this.sanitizeCustomer(updated);
  }

  async createVehicle(user: AuthenticatedCustomerUser, dto: CreateVehicleDto) {
    const customer = await this.assertCanEditCustomer(user, dto.customerId);
    const identity = this.normalizeVehicleIdentity(dto.carPlate, dto.vin);
    await this.assertVehicleIdentityAvailable(customer.storeId, identity);
    await this.assertContactBelongsToCustomer(dto.defaultContactId, customer.id);
    const vehicle = await this.runTransaction(async (tx: any) => {
      const created = await tx.customerVehicle.create({
        data: {
          storeId: customer.storeId,
          customerId: customer.id,
          carPlate: identity.carPlate,
          carPlateNormalized: identity.carPlateNormalized,
          vinEncrypted: identity.vin ? this.codec.encrypt(identity.vin) : undefined,
          vinHash: identity.vin ? this.codec.hash(identity.vin) : undefined,
          carModel: dto.carModel.trim(),
          vehicleTypeCode: dto.vehicleTypeCode,
          carColor: dto.carColor?.trim() || undefined,
          photoUrl: dto.photoUrl,
          defaultContactId: dto.defaultContactId,
          department: dto.department?.trim() || undefined
        }
      });
      await tx.vehicleOwnershipHistory.create({
        data: {
          storeId: customer.storeId,
          vehicleId: created.id,
          toCustomerId: customer.id,
          action: "CREATE",
          afterSnapshot: this.toVehicleSnapshot(created),
          operatedById: user.id
        }
      });
      return created;
    });
    return this.sanitizeVehicle(vehicle);
  }

  async updateVehicle(user: AuthenticatedCustomerUser, id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.prisma.customerVehicle.findUnique({
      where: { id },
      include: { customer: true }
    });
    if (!vehicle) {
      throw new NotFoundException("车辆不存在");
    }
    await this.assertCanEditCustomer(user, vehicle.customerId);
    const identity = this.normalizeVehicleIdentity(
      dto.carPlate === undefined ? vehicle.carPlate ?? undefined : dto.carPlate,
      dto.vin
    );
    const vinHash = dto.vin ? this.codec.hash(identity.vin!) : vehicle.vinHash;
    if (!identity.carPlateNormalized && !vinHash) {
      throw new BadRequestException("车牌号和 VIN 至少填写一项");
    }
    await this.assertVehicleIdentityAvailable(
      vehicle.customer.storeId,
      { ...identity, vinHash },
      vehicle.id
    );
    await this.assertContactBelongsToCustomer(dto.defaultContactId, vehicle.customerId);

    const updated = await this.runTransaction(async (tx: any) => {
      const result = await tx.customerVehicle.update({
        where: { id },
        data: {
          carPlate: identity.carPlate,
          carPlateNormalized: identity.carPlateNormalized,
          vinEncrypted: dto.vin ? this.codec.encrypt(identity.vin!) : undefined,
          vinHash: dto.vin ? vinHash : undefined,
          carModel: dto.carModel?.trim(),
          vehicleTypeCode: dto.vehicleTypeCode,
          carColor: dto.carColor?.trim(),
          photoUrl: dto.photoUrl,
          defaultContactId: dto.defaultContactId,
          department: dto.department?.trim()
        }
      });
      await tx.vehicleOwnershipHistory.create({
        data: {
          storeId: vehicle.customer.storeId,
          vehicleId: vehicle.id,
          fromCustomerId: vehicle.customerId,
          toCustomerId: vehicle.customerId,
          action: "UPDATE",
          beforeSnapshot: this.toVehicleSnapshot(vehicle),
          afterSnapshot: this.toVehicleSnapshot(result),
          operatedById: user.id
        }
      });
      return result;
    });
    return this.sanitizeVehicle(updated);
  }

  async listVehicles(user: AuthenticatedCustomerUser, customerId: string, query: ListCustomerVehiclesDto) {
    await this.assertCanViewCustomer(user, customerId);
    const { page, pageSize, skip } = normalizePagination(query.page, query.pageSize);
    const q = query.q?.trim();
    const where: Prisma.CustomerVehicleWhereInput = {
      customerId,
      status: query.status ?? "ACTIVE",
      ...(q
        ? {
            OR: [
              { carPlate: { contains: q, mode: "insensitive" } },
              { carModel: { contains: q, mode: "insensitive" } },
              { carColor: { contains: q, mode: "insensitive" } },
              { department: { contains: q, mode: "insensitive" } }
            ]
          }
        : {})
    };
    const [total, vehicles] = await Promise.all([
      this.prisma.customerVehicle.count({ where }),
      this.prisma.customerVehicle.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        include: {
          defaultContact: { select: { id: true, name: true, role: true, department: true } },
          _count: { select: { orders: true } }
        }
      })
    ]);
    return { total, page, pageSize, items: vehicles.map((item) => this.sanitizeVehicle(item)) };
  }

  async changeVehicleStatus(
    user: AuthenticatedCustomerUser,
    id: string,
    status: "ACTIVE" | "INACTIVE",
    dto: ChangeVehicleStatusDto
  ) {
    const vehicle = await this.prisma.customerVehicle.findUnique({ where: { id }, include: { customer: true } });
    if (!vehicle) throw new NotFoundException("车辆不存在");
    await this.assertCanManageVehicleLifecycle(user, vehicle.customer.storeId);
    if (vehicle.status === status) return this.sanitizeVehicle(vehicle);
    if (status === "ACTIVE") {
      await this.assertVehicleIdentityAvailable(
        vehicle.customer.storeId,
        { carPlateNormalized: vehicle.carPlateNormalized ?? undefined, vinHash: vehicle.vinHash },
        vehicle.id
      );
    }
    const updated = await this.runTransaction(async (tx: any) => {
      const result = await tx.customerVehicle.update({
        where: { id },
        data: status === "INACTIVE"
          ? { status, disabledAt: new Date(), disabledById: user.id, disabledReason: dto.reason.trim() }
          : { status, disabledAt: null, disabledById: null, disabledReason: null }
      });
      await tx.vehicleOwnershipHistory.create({
        data: {
          storeId: vehicle.customer.storeId,
          vehicleId: vehicle.id,
          fromCustomerId: vehicle.customerId,
          toCustomerId: vehicle.customerId,
          action: status === "INACTIVE" ? "DISABLE" : "ENABLE",
          beforeSnapshot: this.toVehicleSnapshot(vehicle),
          afterSnapshot: this.toVehicleSnapshot(result),
          reason: dto.reason.trim(),
          operatedById: user.id
        }
      });
      return result;
    });
    return this.sanitizeVehicle(updated);
  }

  async transferVehicle(user: AuthenticatedCustomerUser, id: string, dto: TransferVehicleDto) {
    const vehicle = await this.prisma.customerVehicle.findUnique({ where: { id }, include: { customer: true } });
    if (!vehicle) throw new NotFoundException("车辆不存在");
    await this.assertCanManageVehicleLifecycle(user, vehicle.customer.storeId);
    const target = await this.prisma.customer.findUnique({ where: { id: dto.toCustomerId } });
    if (!target) throw new NotFoundException("目标客户不存在");
    if (target.storeId !== vehicle.customer.storeId) throw new BadRequestException("车辆只能转移给同门店客户");
    if (target.id === vehicle.customerId) throw new BadRequestException("车辆已属于该客户");
    const updated = await this.runTransaction(async (tx: any) => {
      const result = await tx.customerVehicle.update({
        where: { id },
        data: { customerId: target.id, defaultContactId: null, department: null }
      });
      await tx.vehicleOwnershipHistory.create({
        data: {
          storeId: target.storeId,
          vehicleId: vehicle.id,
          fromCustomerId: vehicle.customerId,
          toCustomerId: target.id,
          action: "TRANSFER",
          beforeSnapshot: this.toVehicleSnapshot(vehicle),
          afterSnapshot: this.toVehicleSnapshot(result),
          reason: dto.reason.trim(),
          operatedById: user.id
        }
      });
      return result;
    });
    return this.sanitizeVehicle(updated);
  }

  async vehicleHistory(user: AuthenticatedCustomerUser, id: string) {
    const vehicle = await this.prisma.customerVehicle.findUnique({ where: { id } });
    if (!vehicle) throw new NotFoundException("车辆不存在");
    await this.assertCanViewCustomer(user, vehicle.customerId);
    return this.prisma.vehicleOwnershipHistory.findMany({
      where: { vehicleId: id },
      orderBy: { operatedAt: "desc" },
      include: {
        fromCustomer: { select: { id: true, name: true, companyName: true } },
        toCustomer: { select: { id: true, name: true, companyName: true } },
        operatedBy: { select: { id: true, username: true, nickname: true } }
      }
    });
  }

  async createCustomerUser(user: AuthenticatedCustomerUser, dto: CreateCustomerUserForCustomerDto) {
    const customer = await this.assertCanEditCustomer(user, dto.customerId);
    const [companyUser] = this.normalizeCompanyUsers([dto]);
    if (!companyUser) {
      throw new BadRequestException("请输入联系人姓名");
    }
    const created = await this.runTransaction(async (tx: any) => {
      if (companyUser.isDefault) {
        await tx.customerUser.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
      }
      return tx.customerUser.create({
        data: {
          customerId: customer.id,
          ...this.toCustomerUserCreateData(companyUser)
        }
      });
    });
    return this.sanitizeCustomerUser(created);
  }

  async createNote(user: AuthenticatedCustomerUser, dto: CreateCustomerNoteDto) {
    const customer = await this.assertCanEditCustomer(user, dto.customerId);
    return this.prisma.customerNote.create({
      data: {
        customerId: customer.id,
        createdById: user.id,
        noteType: dto.noteType ?? CustomerNoteType.COMMUNICATION,
        content: dto.content
      }
    });
  }

  async createTag(user: AuthenticatedCustomerUser, dto: CreateCustomerTagDto) {
    const customer = await this.assertCanEditCustomer(user, dto.customerId);
    const label = dto.label.trim();
    if (!label) throw new BadRequestException("请输入客户标签");
    if (Array.from(label).length > 30) throw new BadRequestException("客户标签最多 30 个字符");
    if (["新客户", "老客户", "高价值客户", "VIP 客户", "重点关注客户"].includes(label)) {
      throw new ConflictException("该名称为系统标签保留名称");
    }
    try {
      const created = await this.runTransaction(async (tx: any) => {
        const tag = await tx.customerTag.create({ data: { customerId: customer.id, createdById: user.id, label } });
        if (tx.auditEvent?.create) await tx.auditEvent.create({ data: { action: "customer.custom_tag.created", actorId: user.id, storeId: customer.storeId, targetType: "CustomerTag", targetId: tag.id, metadata: { customerId: customer.id, label } } });
        return tag;
      });
      return created;
    } catch (error) {
      if (this.isUniqueConstraintError(error)) throw new ConflictException("客户标签已存在");
      throw error;
    }
  }

  async deleteTag(user: AuthenticatedCustomerUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const tag = await this.prisma.customerTag.findUnique({
      where: { id },
      include: { customer: true }
    });
    if (!tag) {
      throw new NotFoundException("客户标签不存在");
    }
    if (!await this.canCustomer(actor, "write", tag.customer.storeId, tag.customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }
    await this.runTransaction(async (tx: any) => {
      await tx.customerTag.delete({ where: { id } });
      if (tx.auditEvent?.create) await tx.auditEvent.create({ data: { action: "customer.custom_tag.deleted", actorId: user.id, storeId: tag.customer.storeId, targetType: "CustomerTag", targetId: id, metadata: { customerId: tag.customerId, label: tag.label } } });
    });
    return { id };
  }

  private async assertCanEditCustomer(user: AuthenticatedCustomerUser, customerId: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!await this.canCustomer(actor, "write", customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }
    return customer;
  }

  private async assertCanViewCustomer(user: AuthenticatedCustomerUser, customerId: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!await this.canCustomer(actor, "read", customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }
    return customer;
  }

  private async assertCanManageVehicleLifecycle(user: AuthenticatedCustomerUser, storeId: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!this.accessContext || !await this.accessContext.can(actor, "store", "write", { storeId })) {
      throw new ForbiddenException("仅店长可以停用、启用或转移车辆");
    }
    return actor;
  }

  private async buildScopedWhere(user: AccessSubject, storeId: string): Promise<Prisma.CustomerWhereInput> {
    if (!await this.canCustomer(user, "read", storeId)) throw new ForbiddenException("无权限");
    const scope = await this.accessContext!.scope(user, "customers", "read", { storeId });
    return scope.ownerId ? { storeId, ownerUserId: scope.ownerId } : { storeId };
  }

  private async canCustomer(user: AccessSubject, action: "read" | "write", storeId: string, ownerId?: string) {
    if (!this.accessContext) throw new Error("CustomersService access context is not configured");
    return this.accessContext.can(user, "customers", action, { storeId, ownerId });
  }

  private assertValidCreatePayload(dto: CreateCustomerDto) {
    if (!/^1\d{10}$/.test(dto.phone)) {
      throw new BadRequestException("请输入 11 位手机号");
    }
    if (dto.customerType === "PERSONAL" && !dto.name?.trim()) {
      throw new BadRequestException("请输入客户姓名");
    }
    if (dto.customerType === "COMPANY") {
      if (!dto.companyName?.trim()) {
        throw new BadRequestException("请输入企业名称");
      }
      if (!dto.contactPerson?.trim()) {
        throw new BadRequestException("请输入联系人");
      }
    }
  }

  private normalizeCompanyUsers(users: Array<{
    name?: string;
    phone?: string;
    note?: string;
    role?: "PRIMARY" | "SETTLEMENT" | "DRIVER" | "OTHER";
    department?: string;
    isDefault?: boolean;
  }> | undefined) {
    return (users ?? [])
      .map((user) => ({
        name: user.name?.trim(),
        phone: user.phone?.trim(),
        note: user.note?.trim(),
        role: user.role,
        department: user.department?.trim(),
        isDefault: user.isDefault
      }))
      .filter((user) => Boolean(user.name));
  }

  private toCustomerUserCreateData(user: {
    name?: string;
    phone?: string;
    note?: string;
    role?: "PRIMARY" | "SETTLEMENT" | "DRIVER" | "OTHER";
    department?: string;
    isDefault?: boolean;
  }) {
    return {
      name: user.name!,
      phoneEncrypted: user.phone ? this.codec.encrypt(user.phone) : undefined,
      phoneHash: user.phone ? this.codec.hash(user.phone) : undefined,
      note: user.note || undefined,
      role: user.role ?? "OTHER",
      department: user.department || undefined,
      isDefault: user.isDefault ?? false
    };
  }

  private normalizeVehicleIdentity(carPlate?: string, vin?: string) {
    const normalizedPlate = carPlate?.replace(/\s+/g, "").toUpperCase() || undefined;
    const normalizedVin = vin?.replace(/\s+/g, "").toUpperCase() || undefined;
    return {
      carPlate: normalizedPlate,
      carPlateNormalized: normalizedPlate,
      vin: normalizedVin,
      vinHash: normalizedVin ? this.codec.hash(normalizedVin) : undefined
    };
  }

  private async assertVehicleIdentityAvailable(
    storeId: string,
    identity: { carPlateNormalized?: string; vin?: string; vinHash?: string | null },
    excludeVehicleId?: string
  ) {
    const vinHash = identity.vinHash ?? (identity.vin ? this.codec.hash(identity.vin) : undefined);
    if (!identity.carPlateNormalized && !vinHash) {
      throw new BadRequestException("车牌号和 VIN 至少填写一项");
    }
    const duplicate = await this.prisma.customerVehicle.findFirst({
      where: {
        storeId,
        id: excludeVehicleId ? { not: excludeVehicleId } : undefined,
        OR: [
          ...(identity.carPlateNormalized ? [{ carPlateNormalized: identity.carPlateNormalized }] : []),
          ...(vinHash ? [{ vinHash }] : [])
        ]
      },
      select: { id: true, carPlate: true }
    });
    if (duplicate) throw new ConflictException("该门店已存在相同车牌号或 VIN 的车辆");
  }

  private async assertContactBelongsToCustomer(contactId: string | null | undefined, customerId: string) {
    if (!contactId) return;
    const contact = await this.prisma.customerUser.findUnique({ where: { id: contactId }, select: { customerId: true } });
    if (!contact || contact.customerId !== customerId) {
      throw new BadRequestException("默认联系人不属于当前客户");
    }
  }

  private toVehicleSnapshot(vehicle: {
    id: string;
    customerId: string;
    carPlate: string | null;
    carModel: string;
    carColor: string | null;
    vehicleTypeCode: string | null;
    status: string;
    defaultContactId: string | null;
    department: string | null;
  }) {
    return {
      id: vehicle.id,
      customerId: vehicle.customerId,
      carPlate: vehicle.carPlate,
      carModel: vehicle.carModel,
      carColor: vehicle.carColor,
      vehicleTypeCode: vehicle.vehicleTypeCode,
      status: vehicle.status,
      defaultContactId: vehicle.defaultContactId,
      department: vehicle.department
    };
  }

  private normalizeOptionalDate(value: Date | string | undefined) {
    if (value === undefined || value === "") {
      return undefined;
    }
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException("日期格式不正确");
    }
    return date;
  }

  private runTransaction<T>(callback: (tx: any) => Promise<T>) {
    const prisma = this.prisma as any;
    return prisma.$transaction ? prisma.$transaction(callback) : callback(prisma);
  }

  private isUniqueConstraintError(error: unknown) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }

  private buildArchiveSummary(
    customer: {
      warranties?: Array<{ status: string; endDate: Date | null }>;
      afterSales?: Array<{ status: string; responsibility: string }>;
    },
    orderStats: {
      _count: { _all: number };
      _min: { createdAt: Date | null };
      _max: { createdAt: Date | null };
    },
    amountStats: {
      _sum: {
        totalAmountCents: number | null;
        paidAmountCents: number | null;
        outstandingCents: number | null;
      };
    },
    constructionTypeStats: Array<{
      constructionType: string;
      _count: { _all: number };
    }>,
    consumptionTrendOrders: Array<{
      createdAt: Date;
      amount?: {
        totalAmountCents: number;
        paidAmountCents: number;
        outstandingCents: number;
      } | null;
    }>,
    recentConstructionRecords: Array<{
      status: string;
      completedAt: Date | null;
      actualMinutes: number | null;
      qualityResult: string | null;
      order: {
        orderNo: string;
        constructionType: string;
        vehicle?: {
          carPlate?: string | null;
          carModel?: string | null;
          carColor?: string | null;
        } | null;
      };
    }>
  ) {
    const warranties = customer.warranties ?? [];
    const afterSales = customer.afterSales ?? [];
    const now = new Date();
    const expiringSoonThreshold = new Date(now);
    expiringSoonThreshold.setDate(now.getDate() + 30);
    const activeWarranties = warranties.filter((warranty) => warranty.status === "ACTIVE");
    const expiringSoonCount = activeWarranties.filter((warranty) => {
      if (!warranty.endDate) return false;
      const endDate = new Date(warranty.endDate);
      return endDate >= now && endDate <= expiringSoonThreshold;
    }).length;
    const openAfterSalesCount = afterSales.filter((item) =>
      ["OPEN", "ASSIGNED"].includes(item.status)
    ).length;
    const responsibilityDistribution = afterSales.reduce<Record<string, number>>((acc, item) => {
      acc[item.responsibility] = (acc[item.responsibility] ?? 0) + 1;
      return acc;
    }, {});
    const totalAmountCents = amountStats._sum.totalAmountCents ?? 0;
    const outstandingCents = amountStats._sum.outstandingCents ?? 0;
    const constructionTypeDistribution = constructionTypeStats.reduce<Record<string, number>>(
      (acc, item) => {
        acc[item.constructionType] = item._count._all;
        return acc;
      },
      {}
    );

    return {
      consumption: {
        orderCount: orderStats._count._all,
        totalAmountCents,
        paidAmountCents: amountStats._sum.paidAmountCents ?? 0,
        outstandingCents,
        constructionTypeDistribution,
        firstConsumedAt: orderStats._min.createdAt,
        latestConsumedAt: orderStats._max.createdAt,
        trend: this.buildConsumptionTrend(consumptionTrendOrders)
      },
      warranty: {
        activeCount: activeWarranties.length,
        expiredCount: warranties.filter((warranty) => warranty.status === "EXPIRED").length,
        expiringSoonCount,
        latestEndDate: warranties[0]?.endDate ?? null
      },
      afterSales: {
        totalCount: afterSales.length,
        openCount: openAfterSalesCount,
        closedCount: afterSales.filter((item) => ["RESOLVED", "CLOSED"].includes(item.status)).length,
        responsibilityDistribution
      },
      construction: {
        recentRecords: this.buildRecentConstructionRecords(recentConstructionRecords)
      }
    };
  }

  private async attachListConsumptionSummaries<T extends { id: string }>(items: T[]) {
    if (items.length === 0) return items;
    const orders = await this.prisma.order.findMany({
      where: {
        customerId: { in: items.map((item) => item.id) },
        status: { not: OrderStatus.CANCELLED }
      },
      select: {
        customerId: true,
        createdAt: true,
        amount: {
          select: {
            totalAmountCents: true,
            paidAmountCents: true,
            outstandingCents: true
          }
        }
      }
    });
    const grouped = new Map<string, Array<{
      createdAt: Date;
      amount?: {
        totalAmountCents: number;
        paidAmountCents: number;
        outstandingCents: number;
      } | null;
    }>>();
    for (const order of orders) {
      const customerOrders = grouped.get(order.customerId) ?? [];
      customerOrders.push(order);
      grouped.set(order.customerId, customerOrders);
    }
    return items.map((item) => {
      const customerOrders = grouped.get(item.id) ?? [];
      const totalAmountCents = customerOrders.reduce((sum, order) => sum + (order.amount?.totalAmountCents ?? 0), 0);
      const paidAmountCents = customerOrders.reduce((sum, order) => sum + (order.amount?.paidAmountCents ?? 0), 0);
      const outstandingCents = customerOrders.reduce((sum, order) => sum + (order.amount?.outstandingCents ?? 0), 0);
      return {
        ...item,
        archiveSummary: {
          consumption: {
            orderCount: customerOrders.length,
            totalAmountCents,
            paidAmountCents,
            outstandingCents,
            trend: this.buildConsumptionTrend(customerOrders)
          }
        }
      };
    });
  }  private buildConsumptionTrend(orders: Array<{
    createdAt: Date;
    amount?: {
      totalAmountCents: number;
      paidAmountCents: number;
      outstandingCents: number;
    } | null;
  }>) {
    const buckets = new Map<string, {
      month: string;
      orderCount: number;
      totalAmountCents: number;
      paidAmountCents: number;
      outstandingCents: number;
    }>();

    for (const order of orders) {
      const month = order.createdAt.toISOString().slice(0, 7);
      const bucket = buckets.get(month) ?? {
        month,
        orderCount: 0,
        totalAmountCents: 0,
        paidAmountCents: 0,
        outstandingCents: 0
      };
      bucket.orderCount += 1;
      bucket.totalAmountCents += order.amount?.totalAmountCents ?? 0;
      bucket.paidAmountCents += order.amount?.paidAmountCents ?? 0;
      bucket.outstandingCents += order.amount?.outstandingCents ?? 0;
      buckets.set(month, bucket);
    }

    return [...buckets.values()].slice(-6);
  }

  private buildRecentConstructionRecords(records: Array<{
    status: string;
    completedAt: Date | null;
    actualMinutes: number | null;
    qualityResult: string | null;
    order: {
      orderNo: string;
      constructionType: string;
      vehicle?: {
        carPlate?: string | null;
        carModel?: string | null;
        carColor?: string | null;
      } | null;
    };
  }>) {
    return records.map((record) => ({
      orderNo: record.order.orderNo,
      constructionType: record.order.constructionType,
      status: record.status,
      completedAt: record.completedAt,
      actualMinutes: record.actualMinutes,
      qualityResult: record.qualityResult,
      vehicleLabel: this.buildVehicleLabel(record.order.vehicle)
    }));
  }

  private buildVehicleLabel(vehicle?: {
    carPlate?: string | null;
    carModel?: string | null;
    carColor?: string | null;
  } | null) {
    const parts = [vehicle?.carPlate, vehicle?.carModel, vehicle?.carColor].filter(Boolean);
    return parts.length > 0 ? parts.join(" / ") : "-";
  }

  private async decorateCustomer<T extends {
    id: string;
    phoneEncrypted?: unknown;
    phoneHash?: unknown;
    vehicles?: Array<{ vinEncrypted?: unknown; vinHash?: unknown }>;
    users?: Array<{ phoneEncrypted?: unknown; phoneHash?: unknown }>;
    tags?: Array<{ id: string; label: string; createdById?: string | null; createdAt: Date }>;
  }>(customer: T, systemTagFilter?: string, customTagId?: string, providedThresholds?: { highValueThresholdCents: number; vipThresholdCents: number }) {
    const [completedOrderStats, completedAmount, outstandingStats, openAfterSalesCount, expiringSoonCount, thresholds] = await Promise.all([
      this.prisma.order.aggregate({ where: { customerId: customer.id, status: OrderStatus.COMPLETED }, _count: { _all: true } }),
      this.prisma.orderAmount.aggregate({ where: { order: { customerId: customer.id, status: OrderStatus.COMPLETED } }, _sum: { paidAmountCents: true } }),
      this.prisma.orderAmount.aggregate({ where: { order: { customerId: customer.id } }, _sum: { outstandingCents: true } }),
      (this.prisma as any).afterSale?.count ? this.prisma.afterSale.count({ where: { order: { customerId: customer.id }, status: { in: ["OPEN", "ASSIGNED"] } } }) : Promise.resolve(0),
      (this.prisma as any).warranty?.count ? this.prisma.warranty.count({ where: { order: { customerId: customer.id }, status: "ACTIVE", endDate: { gte: new Date(), lt: this.addCalendarDays(new Date(), 30) } } }) : Promise.resolve(0),
      providedThresholds ?? this.getTagThresholds()
    ]);
    const systemTags = this.buildSystemTags({
      completedOrderCount: completedOrderStats._count._all,
      completedPaidAmountCents: completedAmount._sum.paidAmountCents ?? 0,
      highValueThresholdCents: thresholds.highValueThresholdCents,
      vipThresholdCents: thresholds.vipThresholdCents,
      outstandingCents: outstandingStats._sum.outstandingCents ?? 0,
      openAfterSalesCount,
      expiringSoonCount
    });
    const customTags = (customer.tags ?? []).map((tag) => ({ id: tag.id, label: tag.label, createdBy: tag.createdById ?? undefined, createdAt: tag.createdAt.toISOString() }));
    if (systemTagFilter && !systemTags.some((tag) => tag.code === systemTagFilter)) return null;
    if (customTagId && !customTags.some((tag) => tag.id === customTagId)) return null;
    return { ...this.sanitizeCustomer(customer), systemTags, customTags };
  }

  private async getTagThresholds() {
    const row = await (this.prisma as any).settingsConfigVersion?.findFirst?.({
      where: { capabilityCode: "customer.tags", scopeId: "global", status: SettingsConfigStatus.PUBLISHED },
      orderBy: { version: "desc" },
      select: { payload: true }
    });
    const payload = row?.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload as Record<string, unknown> : {};
    const highValueThresholdCents = this.readPositiveThreshold(payload.highValueThresholdCents, 500_000);
    const vipThresholdCents = this.readPositiveThreshold(payload.vipThresholdCents, 1_000_000);
    return { highValueThresholdCents, vipThresholdCents: Math.max(vipThresholdCents, highValueThresholdCents + 1) };
  }

  private readPositiveThreshold(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
  }

  private addCalendarDays(value: Date, days: number) {
    const result = new Date(value);
    result.setDate(result.getDate() + days);
    return result;
  }
  private buildSystemTags(input: {
    completedOrderCount: number;
    completedPaidAmountCents: number;
    highValueThresholdCents: number;
    vipThresholdCents: number;
    outstandingCents: number;
    openAfterSalesCount: number;
    expiringSoonCount: number;
  }) {
    const tags: Array<{ code: string; label: string; level: string; reasons: string[] }> = [];
    if (input.completedOrderCount === 0) tags.push({ code: "NEW_CUSTOMER", label: "新客户", level: "CUSTOMER_STAGE", reasons: ["暂无已完成订单"] });
    else tags.push({ code: "OLD_CUSTOMER", label: "老客户", level: "CUSTOMER_STAGE", reasons: ["存在已完成订单"] });
    if (input.completedPaidAmountCents >= input.vipThresholdCents) tags.push({ code: "VIP", label: "VIP 客户", level: "VALUE", reasons: [`累计已完成订单实收金额 ${this.formatAmount(input.completedPaidAmountCents)} 元，达到 VIP 阈值 ${this.formatAmount(input.vipThresholdCents)} 元`] });
    else if (input.completedPaidAmountCents >= input.highValueThresholdCents) tags.push({ code: "HIGH_VALUE", label: "高价值客户", level: "VALUE", reasons: [`累计已完成订单实收金额 ${this.formatAmount(input.completedPaidAmountCents)} 元，达到高价值阈值 ${this.formatAmount(input.highValueThresholdCents)} 元`] });
    const followUpReasons = [
      ...(input.outstandingCents > 0 ? ["存在未结清尾款"] : []),
      ...(input.openAfterSalesCount > 0 ? ["存在未关闭售后单"] : []),
      ...(input.expiringSoonCount > 0 ? ["质保将在 30 天内到期"] : [])
    ];
    if (followUpReasons.length > 0) tags.push({ code: "KEY_FOLLOW_UP", label: "重点关注客户", level: "WARNING", reasons: followUpReasons });
    return tags;
  }

  private formatAmount(cents: number) {
    return (cents / 100).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private buildSearchConditions(q: string): Prisma.CustomerWhereInput[] {
    const conditions: Prisma.CustomerWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { contactPerson: { contains: q, mode: "insensitive" } },
      { wechat: { contains: q, mode: "insensitive" } },
      { vehicles: { some: { carPlate: { contains: q, mode: "insensitive" } } } }
    ];
    if (/^1\d{10}$/.test(q)) {
      conditions.push({ phoneHash: this.codec.hash(q) });
    }
    if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(q)) {
      conditions.push({ vehicles: { some: { vinHash: this.codec.hash(q) } } });
    }
    return conditions;
  }

  private sanitizeCustomer<
    T extends {
      phoneEncrypted?: unknown;
      phoneHash?: unknown;
      vehicles?: Array<{ vinEncrypted?: unknown; vinHash?: unknown }>;
      users?: Array<{ phoneEncrypted?: unknown; phoneHash?: unknown }>;
    }
  >(customer: T) {
    const { phoneEncrypted: _phoneEncrypted, phoneHash: _phoneHash, ...safeCustomer } = customer;
    return {
      ...safeCustomer,
      ...(Array.isArray(safeCustomer.vehicles)
        ? { vehicles: safeCustomer.vehicles.map((vehicle) => this.sanitizeVehicle(vehicle)) }
        : {}),
      ...(Array.isArray(safeCustomer.users)
        ? { users: safeCustomer.users.map((companyUser) => this.sanitizeCustomerUser(companyUser)) }
        : {})
    };
  }

  private sanitizeVehicle<T extends { vinEncrypted?: unknown; vinHash?: unknown }>(vehicle: T) {
    const { vinEncrypted: _vinEncrypted, vinHash: _vinHash, ...safeVehicle } = vehicle;
    return safeVehicle;
  }

  private sanitizeCustomerUser<T extends { phoneEncrypted?: unknown; phoneHash?: unknown }>(companyUser: T) {
    const { phoneEncrypted: _phoneEncrypted, phoneHash: _phoneHash, ...safeUser } = companyUser;
    return safeUser;
  }
}

function createDefaultSensitiveFieldCodec(): SensitiveFieldCodec {
  const keyMaterial =
    process.env.SENSITIVE_FIELD_KEY ??
    process.env.JWT_ACCESS_SECRET ??
    "mallbay-dev-sensitive-field-key";
  const key = createHash("sha256").update(keyMaterial).digest();
  const hashSalt = process.env.SENSITIVE_FIELD_HASH_SALT ?? keyMaterial;

  return {
    encrypt(value: string) {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
    },
    hash(value: string) {
      return createHash("sha256").update(`${hashSalt}:${value}`).digest("hex");
    }
  };
}
