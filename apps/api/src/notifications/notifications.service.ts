import { Injectable } from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { normalizePagination } from "../common/pagination";

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async send(userId: string, type: keyof typeof NotificationType, payload: object) {
    return this.prisma.notification.create({
      data: { userId, type: type as NotificationType, payload }
    });
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
}
