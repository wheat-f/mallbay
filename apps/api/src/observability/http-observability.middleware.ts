import type { NextFunction, Request, Response } from "express";
import type { RequestWithId } from "../common/request-id.middleware";
import { MetricsService } from "./metrics.service";
import { StructuredLoggerService } from "./structured-logger.service";

type ObservableRequest = Request & RequestWithId;

export function httpObservabilityMiddleware(
  metrics: MetricsService,
  logger: StructuredLoggerService
) {
  return (req: ObservableRequest, res: Response, next: NextFunction) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      const route = getRoute(req);
      const labels = {
        method: req.method,
        route
      };
      const latencyMs = Date.now() - startedAt;
      const status = String(res.statusCode);

      metrics.increment("http_requests_total", { ...labels, status });
      metrics.recordLatency("http_request_duration_ms", latencyMs, labels);

      if (res.statusCode >= 500) {
        metrics.increment("http_errors_total", { ...labels, status });
      }

      logger.info("http.request", {
        requestId: req.requestId,
        method: req.method,
        route,
        status: res.statusCode,
        latencyMs
      });
    });

    next();
  };
}

function getRoute(req: ObservableRequest) {
  return req.route?.path ?? req.originalUrl?.split("?")[0] ?? "unknown";
}
