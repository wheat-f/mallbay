/* eslint-disable @typescript-eslint/consistent-type-imports */
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ProductStatus } from "@prisma/client";
import { normalizePagination } from "../common/pagination";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { CreateProductDto } from "./dto/create-product.dto";
import { ListProductsDto } from "./dto/list-products.dto";
import { UpdateProductDto } from "./dto/update-product.dto";

export type AuthenticatedProductUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(user: AuthenticatedProductUser, dto: CreateProductDto) {
    const actor = await this.withStoreMember(user);
    this.assertCanManageProducts(actor, dto.storeId);

    return this.prisma.product.create({
      data: {
        storeId: dto.storeId,
        brand: dto.brand,
        name: dto.name,
        model: dto.model,
        category: dto.category,
        specification: dto.specification,
        unit: dto.unit,
        warrantyYears: dto.warrantyYears,
        basePriceCents: dto.basePriceCents,
        status: ProductStatus.ACTIVE
      }
    });
  }

  async list(user: AuthenticatedProductUser, dto: ListProductsDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, dto.storeId)) {
      throw new ForbiddenException("无权限");
    }

    const { page, pageSize, skip } = normalizePagination(dto.page, dto.pageSize);
    const where: Prisma.ProductWhereInput = {
      storeId: dto.storeId,
      category: dto.category,
      status: dto.status ?? ProductStatus.ACTIVE
    };
    const q = dto.q?.trim();
    if (q) {
      where.OR = [
        { brand: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        { model: { contains: q, mode: "insensitive" } },
        { specification: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: "desc" }
      })
    ]);

    return { total, page, pageSize, items };
  }

  async detail(user: AuthenticatedProductUser, id: string) {
    const actor = await this.withStoreMember(user);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException("产品不存在");
    }
    if (!PermissionPolicy.canViewStoreData(actor, product.storeId)) {
      throw new ForbiddenException("无权限");
    }
    return product;
  }

  async update(user: AuthenticatedProductUser, id: string, dto: UpdateProductDto) {
    const actor = await this.withStoreMember(user);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException("产品不存在");
    }
    this.assertCanManageProducts(actor, product.storeId);

    return this.prisma.product.update({
      where: { id },
      data: dto
    });
  }

  async remove(user: AuthenticatedProductUser, id: string) {
    const actor = await this.withStoreMember(user);
    const product = await this.prisma.product.findUnique({ where: { id } });
    if (!product) {
      throw new NotFoundException("产品不存在");
    }
    this.assertCanManageProducts(actor, product.storeId);

    return this.prisma.product.update({
      where: { id },
      data: { status: ProductStatus.INACTIVE }
    });
  }

  private assertCanManageProducts(user: UserWithStoreMember, storeId: string) {
    if (!PermissionPolicy.isStoreManager(user, storeId)) {
      throw new ForbiddenException("无权限");
    }
  }

  private async withStoreMember(user: AuthenticatedProductUser): Promise<UserWithStoreMember> {
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
}
