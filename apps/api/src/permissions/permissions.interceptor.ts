import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable } from "rxjs";

@Injectable()
export class PermissionsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Authorization is performed by each resource's AccessContext check.
    // Never derive a mutable legacy role flag from an unrelated permission.
    return next.handle();
  }
}
