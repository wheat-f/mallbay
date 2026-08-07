import { Inject, Injectable } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";

@Injectable()
export class NotificationsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async send(userId: string, type: keyof typeof NotificationType, payload: object, dedupeKey?: string) {
    if (dedupeKey) {
      const existing = await this.prisma.notification.findUnique({ where: { todoKey: dedupeKey } });
      if (existing) return existing;
    }
    try {
      return await this.prisma.notification.create({
        data: { userId, type: type as NotificationType, payload, todoKey: dedupeKey }
      });
    } catch (error) {
      if (dedupeKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.prisma.notification.findUnique({ where: { todoKey: dedupeKey } });
        if (existing) return existing;
      }
      throw error;
    }
  }

  async list(userId: string, page = 1, pageSize = 20) {
    const pagination = normalizePagination(page, pageSize);
    const [total, items] = await Promise.all([
      this.prisma.notification.count({ where: { userId } }),
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip: pagination.skip,
        take: pagination.pageSize
      })
    ]);

    return { total, page: pagination.page, pageSize: pagination.pageSize, items };
  }

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: { userId, isRead: false }
    });
    return { count };
  }

  async markRead(userId: string, ids: string[]) {
    await this.prisma.notification.updateMany({
      where: { id: { in: ids }, userId },
      data: { isRead: true }
    });
    return { success: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true }
    });
    return { success: true };
  }
  async listTodos(userId: string, page = 1, pageSize = 20) {
    const pagination = normalizePagination(page, pageSize);
    const where = { userId, type: NotificationType.ORDER_BALANCE_DUE, handledAt: null };
    const [total, items] = await Promise.all([
      this.prisma.notification.count({ where }),
      this.prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: pagination.skip, take: pagination.pageSize })
    ]);
    return { total, page: pagination.page, pageSize: pagination.pageSize, items };
  }
}
