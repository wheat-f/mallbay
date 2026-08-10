import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { switchMap } from "rxjs/operators";
import { PermissionsService } from "./permissions.service";
import { AccessContext } from "./domain/access-context";

@Injectable()
export class PermissionsInterceptor implements NestInterceptor {
  constructor(
    private readonly permissions: PermissionsService,
    private readonly accessContext?: AccessContext
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: { id: string; isAuditor?: boolean }; query?: { storeId?: string }; body?: { storeId?: string }; params?: { storeId?: string } }>();
    if (!request.user?.id) return next.handle();
    const storeId = request.query?.storeId ?? request.body?.storeId ?? request.params?.storeId;
    const resolved = this.accessContext
      ? this.accessContext.resolve(request.user.id, { storeId })
      : this.permissions.getForUser(request.user.id, { storeId });
    return from(resolved).pipe(switchMap((result) => {
      request.user!.isAuditor = result.roles.some((role) => role.roleCode === "HQ_ADMIN" && role.scopeType === "HQ");
      return next.handle();
    }));
  }
}
