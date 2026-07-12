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
import { CustomerNoteType, Gender, Prisma } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { normalizePagination } from "../common/pagination";
import { type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CustomerPolicy } from "./domain/customer.policy";
import { CreateCustomerNoteDto } from "./dto/create-customer-note.dto";
import { CreateCustomerTagDto } from "./dto/create-customer-tag.dto";
import { CreateCustomerUserForCustomerDto } from "./dto/create-customer-user.dto";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateVehicleDto } from "./dto/create-vehicle.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { UpdateVehicleDto } from "./dto/update-vehicle.dto";

export const SENSITIVE_FIELD_CODEC = Symbol("SENSITIVE_FIELD_CODEC");

export type SensitiveFieldCodec = {
  encrypt(value: string): string;
  hash(value: string): string;
};

export type AuthenticatedCustomerUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class CustomersService {
  private readonly codec: SensitiveFieldCodec;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional()
    @Inject(SENSITIVE_FIELD_CODEC)
    codec?: SensitiveFieldCodec
  ) {
    this.codec = codec ?? createDefaultSensitiveFieldCodec();
  }

  async create(user: AuthenticatedCustomerUser, storeId: string, dto: CreateCustomerDto) {
    const actor = await this.withStoreMember(user);
    if (!CustomerPolicy.canCreate(actor, storeId)) {
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
        ownerUserId: actor.id,
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
    const actor = await this.withStoreMember(user);
    if (!CustomerPolicy.canCreate(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);
    const where = this.buildScopedWhere(actor, dto.storeId);
    const q = dto.q?.trim();
    if (q) {
      where.OR = this.buildSearchConditions(q);
    }

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
          owner: { select: { id: true, username: true, nickname: true } }
        }
      })
    ]);

    return {
      total,
      page,
      pageSize,
      items: items.map((customer) => this.sanitizeCustomer(customer))
    };
  }

  async search(user: AuthenticatedCustomerUser, storeId: string, q: string) {
    const actor = await this.withStoreMember(user);
    if (!CustomerPolicy.canCreate(actor, storeId)) {
      throw new ForbiddenException("无权限");
    }

    const where = this.buildScopedWhere(actor, storeId);
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

    return customers.map((customer) => this.sanitizeCustomer(customer));
  }

  async detail(user: AuthenticatedCustomerUser, id: string) {
    const actor = await this.withStoreMember(user);
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
    if (!CustomerPolicy.canView(actor, customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }

    const [orderStats, amountStats, constructionTypeStats, consumptionTrendOrders, recentConstructionRecords] = await Promise.all([
      this.prisma.order.aggregate({
        where: { customerId: id },
        _count: { _all: true },
        _min: { createdAt: true },
        _max: { createdAt: true }
      }),
      this.prisma.orderAmount.aggregate({
        where: { order: { customerId: id } },
        _sum: {
          totalAmountCents: true,
          paidAmountCents: true,
          outstandingCents: true
        }
      }),
      this.prisma.order.groupBy({
        by: ["constructionType"],
        where: { customerId: id },
        _count: { _all: true }
      }),
      this.prisma.order.findMany({
        where: { customerId: id },
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

    return {
      ...this.sanitizeCustomer(customer),
      archiveSummary: this.buildArchiveSummary(
        customer,
        orderStats,
        amountStats,
        constructionTypeStats,
        consumptionTrendOrders,
        recentConstructionRecords
      )
    };
  }

  async update(user: AuthenticatedCustomerUser, id: string, dto: UpdateCustomerDto) {
    const actor = await this.withStoreMember(user);
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!CustomerPolicy.canEdit(actor, customer.storeId, customer.ownerUserId)) {
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
    const vehicle = await this.prisma.customerVehicle.create({
      data: {
        customerId: customer.id,
        carPlate: dto.carPlate,
        vinEncrypted: dto.vin ? this.codec.encrypt(dto.vin) : undefined,
        vinHash: dto.vin ? this.codec.hash(dto.vin) : undefined,
        carModel: dto.carModel,
        carColor: dto.carColor,
        photoUrl: dto.photoUrl
      }
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

    const updated = await this.prisma.customerVehicle.update({
      where: { id },
      data: {
        carPlate: dto.carPlate,
        vinEncrypted: dto.vin ? this.codec.encrypt(dto.vin) : undefined,
        vinHash: dto.vin ? this.codec.hash(dto.vin) : undefined,
        carModel: dto.carModel,
        carColor: dto.carColor,
        photoUrl: dto.photoUrl
      }
    });
    return this.sanitizeVehicle(updated);
  }

  async createCustomerUser(user: AuthenticatedCustomerUser, dto: CreateCustomerUserForCustomerDto) {
    const customer = await this.assertCanEditCustomer(user, dto.customerId);
    if (customer.customerType !== "COMPANY") {
      throw new BadRequestException("只有企业客户可以维护用户");
    }
    const [companyUser] = this.normalizeCompanyUsers([dto]);
    if (!companyUser) {
      throw new BadRequestException("请输入用户姓名");
    }
    const created = await this.prisma.customerUser.create({
      data: {
        customerId: customer.id,
        ...this.toCustomerUserCreateData(companyUser)
      }
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
    if (!label) {
      throw new BadRequestException("请输入客户标签");
    }
    try {
      return await this.prisma.customerTag.create({
        data: {
          customerId: customer.id,
          createdById: user.id,
          label
        }
      });
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new ConflictException("客户标签已存在");
      }
      throw error;
    }
  }

  async deleteTag(user: AuthenticatedCustomerUser, id: string) {
    const actor = await this.withStoreMember(user);
    const tag = await this.prisma.customerTag.findUnique({
      where: { id },
      include: { customer: true }
    });
    if (!tag) {
      throw new NotFoundException("客户标签不存在");
    }
    if (!CustomerPolicy.canEdit(actor, tag.customer.storeId, tag.customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }
    await this.prisma.customerTag.delete({ where: { id } });
    return { id };
  }

  private async assertCanEditCustomer(user: AuthenticatedCustomerUser, customerId: string) {
    const actor = await this.withStoreMember(user);
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!CustomerPolicy.canEdit(actor, customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }
    return customer;
  }

  private buildScopedWhere(user: UserWithStoreMember, storeId: string): Prisma.CustomerWhereInput {
    if (user.isAuditor) {
      return { storeId };
    }
    if (user.storeMember?.storeId !== storeId) {
      throw new ForbiddenException("无权限");
    }
    if (user.storeMember.position === "SALES") {
      return { storeId, ownerUserId: user.id };
    }
    return { storeId };
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

  private normalizeCompanyUsers(users: Array<{ name?: string; phone?: string; note?: string }> | undefined) {
    return (users ?? [])
      .map((user) => ({
        name: user.name?.trim(),
        phone: user.phone?.trim(),
        note: user.note?.trim()
      }))
      .filter((user) => Boolean(user.name));
  }

  private toCustomerUserCreateData(user: { name?: string; phone?: string; note?: string }) {
    return {
      name: user.name!,
      phoneEncrypted: user.phone ? this.codec.encrypt(user.phone) : undefined,
      phoneHash: user.phone ? this.codec.hash(user.phone) : undefined,
      note: user.note || undefined
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
      warranties?: Array<{ status: string; endDate: Date }>;
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
      },
      systemTags: this.buildSystemTags({
        orderCount: orderStats._count._all,
        totalAmountCents,
        outstandingCents,
        openAfterSalesCount,
        expiringSoonCount
      })
    };
  }

  private buildConsumptionTrend(orders: Array<{
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

  private buildSystemTags(input: {
    orderCount: number;
    totalAmountCents: number;
    outstandingCents: number;
    openAfterSalesCount: number;
    expiringSoonCount: number;
  }) {
    const tags: Array<{ code: string; label: string }> = [];
    if (input.orderCount === 0) {
      tags.push({ code: "NEW_CUSTOMER", label: "新客户" });
    }
    if (input.orderCount >= 2) {
      tags.push({ code: "OLD_CUSTOMER", label: "老客户" });
    }
    if (input.totalAmountCents >= 500_000) {
      tags.push({ code: "HIGH_VALUE", label: "高价值客户" });
    }
    if (input.totalAmountCents >= 1_000_000) {
      tags.push({ code: "VIP", label: "VIP 客户" });
    }
    if (
      input.outstandingCents > 0 ||
      input.openAfterSalesCount > 0 ||
      input.expiringSoonCount > 0
    ) {
      tags.push({ code: "KEY_FOLLOW_UP", label: "重点关注客户" });
    }
    return tags;
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

  private async withStoreMember(user: AuthenticatedCustomerUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) {
      return user;
    }

    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });

    return {
      id: user.id,
      isAuditor: user.isAuditor,
      storeMember: member
    };
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
