import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import * as express from "express";
import * as path from "path";
import { AppModule } from "./app.module";
import { ApiExceptionFilter } from "./common/api-exception.filter";
import { requestIdMiddleware } from "./common/request-id.middleware";
import { httpObservabilityMiddleware } from "./observability/http-observability.middleware";
import { MetricsService } from "./observability/metrics.service";
import { StructuredLoggerService } from "./observability/structured-logger.service";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const webOrigin = config.get<string>("WEB_ORIGIN") ?? "http://localhost:3000";

  app.use(requestIdMiddleware);
  app.use(httpObservabilityMiddleware(app.get(MetricsService), app.get(StructuredLoggerService)));
  if (config.get<string>("OSS_PROVIDER") === "local") {
    const localOssRoot = path.resolve(config.get<string>("OSS_LOCAL_DIR") ?? ".local/oss");
    app.use("/local-oss", express.static(localOssRoot));
  }
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",
      "If-None-Match",
      "Idempotency-Key",
      "X-Lifecycle-Version",
      "X-Task-Version"
    ],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(config.get<number>("PORT") ?? 4001);
}

void bootstrap();
