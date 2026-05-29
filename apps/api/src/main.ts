import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
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
  app.enableCors({
    origin: webOrigin,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"]
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true
    })
  );
  app.useGlobalFilters(new ApiExceptionFilter());

  await app.listen(config.get<number>("PORT") ?? 3001);
}

void bootstrap();
