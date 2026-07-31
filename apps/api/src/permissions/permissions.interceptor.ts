import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { switchMap } from "rxjs/operators";
import { PermissionsService } from "./permissions.service";

@Injectable()
export class PermissionsInterceptor implements NestInterceptor {
  constructor(private readonly permissions: PermissionsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: { id: string; isAuditor?: boolean }; query?: { storeId?: string }; body?: { storeId?: string }; params?: { storeId?: string } }>();
    if (!request.user?.id) return next.handle();
    const storeId = request.query?.storeId ?? request.body?.storeId ?? request.params?.storeId;
    return from(this.permissions.getForUser(request.user.id)).pipe(switchMap((result) => {
      request.user!.isAuditor = result.roles.some((role) => role.scopeType === "HQ") && result.permissions.some((permission) => permission.code === "settings" && permission.actions.includes("write") && permission.scopes.includes("GLOBAL"));
      return next.handle();
    }));
  }
}
