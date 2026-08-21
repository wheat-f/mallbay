import { CallHandler, ExecutionContext, Inject, Injectable, NestInterceptor, Optional } from "@nestjs/common";
import { Observable, from } from "rxjs";
import { switchMap } from "rxjs/operators";
import { PermissionsService } from "./permissions.service";
import { AccessContext } from "./domain/access-context";

@Injectable()
export class PermissionsInterceptor implements NestInterceptor {
  constructor(
    @Inject(PermissionsService) private readonly permissions: PermissionsService,
    @Optional() @Inject(AccessContext) private readonly accessContext?: AccessContext
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{ user?: { id: string; isAuditor?: boolean }; query?: { storeId?: string }; body?: { storeId?: string }; params?: { storeId?: string } }>();
    if (!request.user?.id) return next.handle();
    const storeId = request.query?.storeId ?? request.body?.storeId ?? request.params?.storeId;
    const resolved = this.accessContext
      ? this.accessContext.scope({ userId: request.user.id }, "settings", "write", { storeId })
      : this.permissions.buildScopeFacts(request.user.id, "settings", "write", { storeId });
    return from(resolved).pipe(switchMap((result) => {
      request.user!.isAuditor = result.allowed && result.global;
      return next.handle();
    }));
  }
}
