import { Controller, Get, Headers, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MetricsService } from "./metrics.service";

/** Internal-only metrics scrape surface; business clients never receive it. */
@Controller("internal")
export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: ConfigService
  ) {}

  @Get("metrics")
  snapshot(@Headers("x-metrics-token") token?: string) {
    const expected = this.config.get<string>("METRICS_TOKEN")?.trim();
    if (!expected || token !== expected) throw new NotFoundException();
    return this.metrics.snapshot();
  }
}
