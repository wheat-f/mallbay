import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { CustomerType, Gender, Prisma } from "@prisma/client";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { normalizePagination } from "../common/pagination";
import { type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CustomerPolicy } from "./domain/customer.policy";
import { CreateCustomerNoteDto } from "./dto/create-customer-note.dto";
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
    private readonly prisma: PrismaService,
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

    const phoneHash = this.codec.hash(dto.phone);
    const existing = await this.prisma.customer.findUnique({
      where: { storeId_phoneHash: { storeId, phoneHash } }
    });
    if (existing) {
      throw new ConflictException("客户手机号已存在");
    }

    const customer = await this.prisma.customer.create({
      data: {
        storeId,
        ownerUserId: actor.id,
        customerType: dto.customerType,
        name: dto.name,
        gender: dto.gender ?? Gender.UNKNOWN,
        birthday: dto.birthday,
        companyName: dto.companyName,
        contactPerson: dto.contactPerson,
        phoneEncrypted: this.codec.encrypt(dto.phone),
        phoneHash,
        wechat: dto.wechat,
        sourceType: dto.sourceType,
        sourceDetail: dto.sourceDetail,
        referrerId: dto.referrerId
      }
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
      include: { vehicles: { take: 2, orderBy: { updatedAt: "desc" } } }
    });

    return customers.map((customer) => this.sanitizeCustomer(customer));
  }

  async detail(user: AuthenticatedCustomerUser, id: string) {
    const actor = await this.withStoreMember(user);
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: {
        vehicles: { orderBy: { updatedAt: "desc" } },
        notes: { orderBy: { createdAt: "desc" } },
        owner: { select: { id: true, username: true, nickname: true } },
        orders: { orderBy: { createdAt: "desc" }, take: 10 }
      }
    });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    if (!CustomerPolicy.canView(actor, customer.storeId, customer.ownerUserId)) {
      throw new ForbiddenException("无权限");
    }

    return this.sanitizeCustomer(customer);
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
      birthday: dto.birthday,
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

  async createNote(user: AuthenticatedCustomerUser, dto: CreateCustomerNoteDto) {
    const customer = await this.assertCanEditCustomer(user, dto.customerId);
    return this.prisma.customerNote.create({
      data: {
        customerId: customer.id,
        createdById: user.id,
        content: dto.content
      }
    });
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

  private buildSearchConditions(q: string): Prisma.CustomerWhereInput[] {
    const conditions: Prisma.CustomerWhereInput[] = [
      { name: { contains: q, mode: "insensitive" } },
      { companyName: { contains: q, mode: "insensitive" } },
      { contactPerson: { contains: q, mode: "insensitive" } },
      { wechat: { contains: q, mode: "insensitive" } }
    ];
    if (/^1\d{10}$/.test(q)) {
      conditions.push({ phoneHash: this.codec.hash(q) });
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
    }
  >(customer: T) {
    const { phoneEncrypted: _phoneEncrypted, phoneHash: _phoneHash, ...safeCustomer } = customer;
    if (Array.isArray(safeCustomer.vehicles)) {
      return {
        ...safeCustomer,
        vehicles: safeCustomer.vehicles.map((vehicle) => this.sanitizeVehicle(vehicle))
      };
    }
    return safeCustomer;
  }

  private sanitizeVehicle<T extends { vinEncrypted?: unknown; vinHash?: unknown }>(vehicle: T) {
    const { vinEncrypted: _vinEncrypted, vinHash: _vinHash, ...safeVehicle } = vehicle;
    return safeVehicle;
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
